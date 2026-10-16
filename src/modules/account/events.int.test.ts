import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { accountEvent, user, whatsappLink, whatsappMessage } from "@/db/schema";
import { auth } from "@/lib/auth";
import { handleIncomingMessage } from "@/modules/bot/handle-message";
import { consumeLinkCode, createLinkCode, unlinkUser } from "@/modules/whatsapp/link";
import { capturingSender, createUser, fakeExtractor, incoming } from "../../../test/integration/factories";
import { deleteAccountData } from "./delete-account";
import { recordEvents } from "./events";

// El historial de cada cuenta (registro y vinculación de WhatsApp), con la base de verdad: cada
// cambio deja su evento, en la misma transacción.

const events = () =>
  db
    .select({
      type: accountEvent.type,
      userId: accountEvent.userId,
      phone: accountEvent.phone,
      details: accountEvent.details,
    })
    .from(accountEvent)
    .orderBy(asc(accountEvent.createdAt), asc(accountEvent.type));

async function link(userId: string, phone: string) {
  return consumeLinkCode(phone, (await createLinkCode(userId)).code);
}

describe("registro", () => {
  it("crear una cuenta (Better Auth) deja el evento de registro", async () => {
    await auth.api.signUpEmail({ body: { name: "Ana", email: "ana@test.local", password: "clave-segura-123" } });
    const [ana] = await db.select().from(user).where(eq(user.email, "ana@test.local"));

    expect(await events()).toEqual([{ type: "registered", userId: ana.id, phone: null, details: {} }]);
    const [event] = await db.select().from(accountEvent);
    expect(Math.abs(event.createdAt.getTime() - ana.createdAt.getTime())).toBeLessThan(5_000);
  });

  it("un registro fallido (correo repetido) no deja otro evento", async () => {
    await auth.api.signUpEmail({ body: { name: "Ana", email: "ana@test.local", password: "clave-segura-123" } });
    await expect(
      auth.api.signUpEmail({ body: { name: "Otra", email: "ana@test.local", password: "clave-segura-123" } }),
    ).rejects.toThrow();
    expect(await events()).toHaveLength(1);
  });
});

describe("vinculación de WhatsApp", () => {
  it("generar un código deja un evento (sin el código)", async () => {
    const ana = await createUser();
    const { code } = await createLinkCode(ana.id);

    expect(await events()).toEqual([{ type: "whatsapp_code_created", userId: ana.id, phone: null, details: {} }]);
    expect(JSON.stringify(await db.select().from(accountEvent))).not.toContain(code);
  });

  it("vincular deja el evento con el número completo", async () => {
    const ana = await createUser();
    await link(ana.id, "573001112233");

    expect(await events()).toEqual([
      { type: "whatsapp_code_created", userId: ana.id, phone: null, details: {} },
      { type: "whatsapp_linked", userId: ana.id, phone: "573001112233", details: {} },
    ]);
  });

  it("cambiar de número deja la desvinculación del anterior y la vinculación del nuevo", async () => {
    const ana = await createUser();
    await link(ana.id, "573001111111");
    await link(ana.id, "573002222222");

    const linkEvents = (await events()).filter((e) => e.type !== "whatsapp_code_created");
    expect(linkEvents).toEqual([
      { type: "whatsapp_linked", userId: ana.id, phone: "573001111111", details: {} },
      { type: "whatsapp_linked", userId: ana.id, phone: "573002222222", details: {} },
      { type: "whatsapp_unlinked", userId: ana.id, phone: "573001111111", details: { reason: "number_changed" } },
    ]);
  });

  it("si el número pasa a otra cuenta, la anterior queda desvinculada con ese motivo", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await link(ana.id, "573001112233");
    await link(beto.id, "573001112233");

    const unlinked = (await events()).filter((e) => e.type === "whatsapp_unlinked");
    expect(unlinked).toEqual([
      { type: "whatsapp_unlinked", userId: ana.id, phone: "573001112233", details: { reason: "number_moved" } },
    ]);
    expect((await events()).filter((e) => e.type === "whatsapp_linked").map((e) => e.userId)).toEqual([ana.id, beto.id]);
  });

  it("volver a vincular el mismo número no inventa una desvinculación", async () => {
    const ana = await createUser();
    await link(ana.id, "573001112233");
    await link(ana.id, "573001112233");

    expect((await events()).filter((e) => e.type === "whatsapp_unlinked")).toEqual([]);
    expect((await events()).filter((e) => e.type === "whatsapp_linked")).toHaveLength(2);
  });

  it("desvincular deja el evento con el número; sin número vinculado no deja nada", async () => {
    const ana = await createUser();
    await link(ana.id, "573001112233");
    await unlinkUser(ana.id);
    await unlinkUser(ana.id);

    expect((await events()).filter((e) => e.type === "whatsapp_unlinked")).toEqual([
      { type: "whatsapp_unlinked", userId: ana.id, phone: "573001112233", details: { reason: "by_user" } },
    ]);
  });

  it("un código inválido deja un intento fallido sin cuenta, con el número", async () => {
    await createUser();
    expect(await consumeLinkCode("573009998877", "000000")).toEqual({ ok: false, reason: "invalid" });

    expect(await events()).toEqual([
      { type: "whatsapp_link_failed", userId: null, phone: "573009998877", details: { reason: "invalid_code" } },
    ]);
  });

  it("un código vencido también cuenta como inválido", async () => {
    const ana = await createUser();
    const { code } = await createLinkCode(ana.id);
    await db.execute(sql`update whatsapp_link_code set expires_at = now() - interval '1 minute'`);

    await consumeLinkCode("573009998877", code);

    expect((await events()).at(-1)).toEqual({
      type: "whatsapp_link_failed",
      userId: null,
      phone: "573009998877",
      details: { reason: "invalid_code" },
    });
    expect(await db.select().from(whatsappLink)).toEqual([]);
  });

  it("con demasiados intentos en la hora, el bloqueo queda en el historial una sola vez", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await consumeLinkCode("573009998877", "000000")).toEqual({ ok: false, reason: "invalid" });
    }
    for (let i = 0; i < 3; i++) {
      expect(await consumeLinkCode("573009998877", "123456")).toEqual({ ok: false, reason: "rate_limited" });
    }
    const failed = { type: "whatsapp_link_failed", userId: null, phone: "573009998877" };
    expect(await events()).toEqual([
      ...Array.from({ length: 5 }, () => ({ ...failed, details: { reason: "invalid_code" } })),
      { ...failed, details: { reason: "rate_limited" } },
    ]);
  });

  it("de punta a punta por el bot: VINCULAR con un código bueno y con uno malo", async () => {
    const ana = await createUser({ name: "Ana" });
    const d = { extractor: fakeExtractor([]), send: capturingSender().send, appUrl: "https://app.test" };
    const { code } = await createLinkCode(ana.id);

    await handleIncomingMessage(incoming("VINCULAR 000000", "573004443322"), d);
    await handleIncomingMessage(incoming(`VINCULAR ${code}`, "573001112233"), d);

    expect(await events()).toEqual([
      { type: "whatsapp_code_created", userId: ana.id, phone: null, details: {} },
      { type: "whatsapp_link_failed", userId: null, phone: "573004443322", details: { reason: "invalid_code" } },
      { type: "whatsapp_linked", userId: ana.id, phone: "573001112233", details: {} },
    ]);
  });

  it("los eventos de cada cuenta son solo suyos", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await link(ana.id, "573001111111");
    await createLinkCode(beto.id);

    const byUser = (id: string) => db.select().from(accountEvent).where(eq(accountEvent.userId, id));
    expect((await byUser(ana.id)).map((e) => e.type).sort()).toEqual(["whatsapp_code_created", "whatsapp_linked"]);
    expect((await byUser(beto.id)).map((e) => e.type)).toEqual(["whatsapp_code_created"]);
  });
});

describe("transacciones", () => {
  it("si el cambio falla, su evento tampoco queda", async () => {
    const ana = await createUser();
    await expect(
      db.transaction(async (tx) => {
        await recordEvents([{ type: "whatsapp_code_created", userId: ana.id }], tx);
        throw new Error("falla después del evento");
      }),
    ).rejects.toThrow("falla después del evento");
    expect(await events()).toEqual([]);
  });

  it("recordEvents con una lista vacía no hace nada", async () => {
    await recordEvents([]);
    expect(await events()).toEqual([]);
  });

  it("la base solo acepta los tipos de evento conocidos", async () => {
    await expect(
      db.execute(sql`insert into account_event (type) values ('otra_cosa')`),
    ).rejects.toThrow();
  });
});

describe("borrar la cuenta", () => {
  it("borra su historial y los intentos fallidos desde su número, pero no los de otros", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await consumeLinkCode("573001112233", "000000"); // Intento fallido antes de vincular.
    await link(ana.id, "573001112233");
    await consumeLinkCode("573009998877", "000000"); // De otro número.
    await link(beto.id, "573005550000");

    await deleteAccountData(ana.id);

    const left = await events();
    expect(left.some((e) => e.userId === ana.id || e.phone === "573001112233")).toBe(false);
    expect(left.filter((e) => e.userId === beto.id)).toHaveLength(2);
    expect(left).toContainEqual({ type: "whatsapp_link_failed", userId: null, phone: "573009998877", details: { reason: "invalid_code" } });
  });
});

describe("reconstrucción de la historia previa (migración 0006)", () => {
  /** Las sentencias de reconstrucción de la migración, tal cual. */
  function backfillStatements() {
    const file = readdirSync(join(process.cwd(), "drizzle")).find((f) => f.startsWith("0006_"))!;
    const source = readFileSync(join(process.cwd(), "drizzle", file), "utf8");
    return source
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => /^(--[^\n]*\n)*INSERT INTO "account_event"/.test(s));
  }

  it("la migración trae las tres reconstrucciones", () => {
    expect(backfillStatements()).toHaveLength(3);
  });

  it("reconstruye registros, vínculos actuales e intentos fallidos con su fecha original", async () => {
    const created = new Date("2026-03-01T15:00:00Z");
    const linkedAt = new Date("2026-03-05T12:00:00Z");
    const failedAt = new Date("2026-03-04T10:00:00Z");
    const ana = await createUser({ createdAt: created });
    const beto = await createUser({ createdAt: new Date("2026-04-01T00:00:00Z") });
    await db.insert(whatsappLink).values({ userId: ana.id, phone: "573001112233", linkedAt });
    await db.insert(whatsappMessage).values([
      { id: "f1", phone: "573004443322", body: "VINCULAR 1", status: "link_failed", receivedAt: failedAt },
      { id: "ok", phone: "573001112233", body: "hola", status: "processed", userId: ana.id },
    ]);
    await db.delete(accountEvent);

    for (const statement of backfillStatements()) await db.execute(sql.raw(statement));

    const rows = await db.select().from(accountEvent).orderBy(asc(accountEvent.createdAt));
    expect(rows.map(({ type, userId, phone, details, createdAt }) => ({ type, userId, phone, details, createdAt }))).toEqual([
      { type: "registered", userId: ana.id, phone: null, details: { reconstructed: true }, createdAt: created },
      { type: "whatsapp_link_failed", userId: null, phone: "573004443322", details: { reconstructed: true }, createdAt: failedAt },
      { type: "whatsapp_linked", userId: ana.id, phone: "573001112233", details: { reconstructed: true }, createdAt: linkedAt },
      { type: "registered", userId: beto.id, phone: null, details: { reconstructed: true }, createdAt: beto.createdAt },
    ]);
  });
});
