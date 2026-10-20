import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, user as userTable, whatsappLink, whatsappLinkCode } from "@/db/schema";
import { LINK_LIMITS } from "@/modules/bot/limits";
import { createUser } from "../../../test/integration/factories";
import {
  consumeLinkCode,
  createLinkCode,
  getLinkForUser,
  getUserByPhone,
  LinkCodeLimitError,
  unlinkUser,
} from "./link";

// Los códigos salen de randomInt: una prueba lo fija para forzar un choque con el código de otra cuenta.
vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return { ...crypto, randomInt: vi.fn(crypto.randomInt) };
});

describe("vinculación de WhatsApp", () => {
  it("el código tiene 6 dígitos, vence en ~10 minutos y se guarda solo su hash", async () => {
    const user = await createUser();

    const { code, expiresAt } = await createLinkCode(user.id);

    expect(code).toMatch(/^\d{6}$/);
    const minutes = (expiresAt.getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThanOrEqual(10);
    const [stored] = await db.select().from(whatsappLinkCode);
    expect(stored.codeHash).not.toBe(code);
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("consumir el código crea el vínculo y permite encontrar al usuario por teléfono", async () => {
    const user = await createUser({ name: "Ana", timezone: "America/Bogota", currency: "COP" });
    const { code } = await createLinkCode(user.id);

    expect(await consumeLinkCode("573001112233", code)).toEqual({
      ok: true,
      userId: user.id,
      name: "Ana",
    });
    expect(await getLinkForUser(user.id)).toMatchObject({ phone: "573001112233" });
    expect(await getUserByPhone("573001112233")).toEqual({
      id: user.id,
      name: "Ana",
      timezone: "America/Bogota",
      currency: "COP",
      suspendedAt: null,
    });
    expect(await getUserByPhone("573000000000")).toBeNull();
  });

  it("vincular un número nuevo reemplaza el anterior de la misma cuenta", async () => {
    const user = await createUser();
    await consumeLinkCode("573001111111", (await createLinkCode(user.id)).code);
    await consumeLinkCode("573002222222", (await createLinkCode(user.id)).code);

    const links = await db.select().from(whatsappLink);
    expect(links).toEqual([expect.objectContaining({ userId: user.id, phone: "573002222222" })]);
  });

  it("desvincular elimina el número y cualquier código pendiente", async () => {
    const user = await createUser();
    await consumeLinkCode("573001112233", (await createLinkCode(user.id)).code);
    await createLinkCode(user.id);

    await unlinkUser(user.id);

    expect(await getLinkForUser(user.id)).toBeNull();
    expect(await getUserByPhone("573001112233")).toBeNull();
    expect(await db.select().from(whatsappLinkCode)).toEqual([]);
  });

  it("desvincular devuelve el número que tenía (o null) y registra quién fue", async () => {
    const user = await createUser();
    const admin = await createUser({ name: "Ana Admin", role: "admin" });
    await consumeLinkCode("573001112233", (await createLinkCode(user.id)).code);

    expect(await unlinkUser(user.id, { adminId: admin.id })).toBe("573001112233");
    expect(await unlinkUser(user.id, { adminId: admin.id })).toBeNull();

    const unlinked = await db.select().from(accountEvent).where(eq(accountEvent.type, "whatsapp_unlinked"));
    expect(unlinked).toEqual([
      expect.objectContaining({ userId: user.id, phone: "573001112233", details: { reason: "by_admin" }, adminId: admin.id }),
    ]);
  });

  it("sin admin, la desvinculó la persona", async () => {
    const user = await createUser();
    await consumeLinkCode("573001112233", (await createLinkCode(user.id)).code);
    await unlinkUser(user.id);
    const [event] = await db.select().from(accountEvent).where(eq(accountEvent.type, "whatsapp_unlinked"));
    expect(event).toMatchObject({ details: { reason: "by_user" }, adminId: null });
  });

  it("borrar la cuenta borra también su vínculo", async () => {
    const user = await createUser();
    await consumeLinkCode("573001112233", (await createLinkCode(user.id)).code);

    await db.delete(userTable).where(eq(userTable.id, user.id));

    expect(await getUserByPhone("573001112233")).toBeNull();
  });
});

describe("los topes de la vinculación son de cada cuenta y de cada número", () => {
  it("el tope de códigos por hora es por cuenta: Ana llega al tope y Beto todavía genera el suyo", async () => {
    const ana = await createUser();
    const beto = await createUser();
    for (let i = 0; i < LINK_LIMITS.codesPerHour; i++) await createLinkCode(ana.id);
    await expect(createLinkCode(ana.id)).rejects.toBeInstanceOf(LinkCodeLimitError);

    const { code } = await createLinkCode(beto.id);
    expect(await consumeLinkCode("573002222222", code)).toMatchObject({ ok: true, userId: beto.id });
  });

  it("los códigos equivocados se cuentan por número: uno bloqueado no bloquea a otro", async () => {
    const ana = await createUser();
    for (let i = 0; i < LINK_LIMITS.failedAttemptsPerHour; i++) {
      expect(await consumeLinkCode("573001111111", "000000")).toEqual({ ok: false, reason: "invalid" });
    }
    const { code } = await createLinkCode(ana.id);
    // Bloqueado, ni con el código bueno; desde otro número, sí.
    expect(await consumeLinkCode("573001111111", code)).toEqual({ ok: false, reason: "rate_limited" });
    expect(await consumeLinkCode("573002222222", code)).toMatchObject({ ok: true, userId: ana.id });
  });

  it("si el código nuevo choca con el vigente de otra cuenta, se genera otro: cada código vincula a su cuenta", async () => {
    const ana = await createUser();
    const beto = await createUser();
    vi.mocked(randomInt).mockReturnValueOnce(123456 as never);
    expect((await createLinkCode(ana.id)).code).toBe("123456");
    vi.mocked(randomInt)
      .mockReturnValueOnce(123456 as never)
      .mockReturnValueOnce(654321 as never);
    expect((await createLinkCode(beto.id)).code).toBe("654321");

    expect(await consumeLinkCode("573001111111", "123456")).toMatchObject({ ok: true, userId: ana.id });
    expect(await consumeLinkCode("573002222222", "654321")).toMatchObject({ ok: true, userId: beto.id });
  });
});
