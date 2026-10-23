import { asc } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, appNotice } from "@/db/schema";
import { toBogotaDateTime } from "@/modules/notice/notice";
import { requestLocale } from "../../../../../../test/integration/locale";
import { createAdminWithTwoFactor } from "../../../../../../test/integration/two-factor";

// El aviso para todos desde /admin/configuracion: las Server Actions con la capa de datos y la base de verdad, y
// los códigos como Google Authenticator. Se simulan la sesión y refresh().
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

const { publishNoticeAction, removeNoticeAction } = await import("./actions");
const { getNoticeSettings, noticeSummary } = await import("@/modules/admin/configuracion/notice");

// Cada código sirve una vez y nunca uno anterior: cada acción usa el de los siguientes 30 s.
let step = 0;
async function seed() {
  const { admin, codeAt } = await createAdminWithTwoFactor();
  mocks.requireAdmin.mockReset().mockResolvedValue({ id: admin.id, role: "admin", twoFactorEnabled: true });
  mocks.refresh.mockReset();
  step = 0;
  return { admin, code: () => codeAt(new Date(Date.now() + 30_000 * step++)) };
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const DAY = 24 * 60 * 60 * 1000;
/** La fecha de fin, como la escribe el campo (hora de Colombia), a esos días de ahora, en punto. */
const inDays = (days: number) => {
  const date = new Date(Date.now() + days * DAY);
  date.setUTCMinutes(0, 0, 0);
  return { input: toBogotaDateTime(date), date };
};
const notice = (fields: Partial<Record<"message" | "messageEn" | "tone" | "endsAt" | "code", string>>) =>
  form({ message: "Mantenimiento el sábado de 8 a 9", tone: "important", endsAt: inDays(2).input, ...fields });
const events = () =>
  db
    .select({ type: accountEvent.type, userId: accountEvent.userId, adminId: accountEvent.adminId, details: accountEvent.details })
    .from(accountEvent)
    .orderBy(asc(accountEvent.createdAt));

describe("publicar el aviso", () => {
  it("sin aviso: nada en Configuración ni en Inicio", async () => {
    await seed();
    expect(await getNoticeSettings()).toBeNull();
    expect(await noticeSummary()).toBeNull();
  });

  it("con el código lo publica (el texto en una línea) y queda en el historial (sin cuenta)", async () => {
    const { admin, code } = await seed();
    const end = inDays(2);
    const result = await publishNoticeAction({}, notice({ message: "  Mantenimiento   el sábado\n de 8 a 9 ", messageEn: " ", endsAt: end.input, code: code() }));
    expect(result.message).toMatch(/^Se publicó el aviso: se ve hasta el \d+ de \w+\. de \d{4}, /);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    const view = await getNoticeSettings();
    expect(view).toMatchObject({
      message: "Mantenimiento el sábado de 8 a 9",
      messageEn: null,
      tone: "important",
      endsAt: end.date,
      active: true,
      published: { by: "Ana Admin" },
    });
    expect(await noticeSummary()).toEqual({ endsAt: end.date });
    expect(await events()).toEqual([
      {
        type: "notice_published",
        userId: null,
        adminId: admin.id,
        details: { notice: { message: "Mantenimiento el sábado de 8 a 9", tone: "important", endsAt: end.date.toISOString() } },
      },
    ]);
  });

  it("cambiarlo es publicar otro: otra versión, el inglés y otro evento", async () => {
    const { code } = await seed();
    await publishNoticeAction({}, notice({ code: code() }));
    const [first] = await db.select().from(appNotice);
    const result = await publishNoticeAction({}, notice({ message: "Nuevo: presupuestos", messageEn: "New: budgets", tone: "info", code: code() }));
    expect(result).toHaveProperty("message");
    const [second] = await db.select().from(appNotice);
    expect(second).toMatchObject({ message: "Nuevo: presupuestos", messageEn: "New: budgets", tone: "info" });
    expect(second.publishedAt.getTime()).toBeGreaterThan(first.publishedAt.getTime());
    expect((await events()).map((e) => e.type)).toEqual(["notice_published", "notice_published"]);
  });

  it("lo que no sirve lo dice en su campo, sin gastar el código ni guardar nada", async () => {
    const { code } = await seed();
    const unused = code();
    const long = "a".repeat(201);
    expect(await publishNoticeAction({}, notice({ message: "  ", code: unused }))).toEqual({ error: "Escribe el aviso.", field: "message" });
    expect(await publishNoticeAction({}, notice({ message: long, code: unused }))).toEqual({ error: "Puede tener hasta 200 caracteres.", field: "message" });
    expect(await publishNoticeAction({}, notice({ messageEn: long, code: unused }))).toEqual({ error: "Puede tener hasta 200 caracteres.", field: "messageEn" });
    expect(await publishNoticeAction({}, notice({ tone: "danger", code: unused }))).toEqual({ error: "Elige el tipo de aviso.", field: "tone" });
    expect(await publishNoticeAction({}, notice({ endsAt: "mañana", code: unused }))).toEqual({ error: "Elige la fecha y la hora de fin.", field: "endsAt" });
    expect(await publishNoticeAction({}, notice({ endsAt: inDays(-1).input, code: unused }))).toEqual({
      error: "Esa fecha ya pasó: elige una más adelante.",
      field: "endsAt",
    });
    expect(await publishNoticeAction({}, notice({ endsAt: inDays(32).input, code: unused }))).toEqual({
      error: "Un aviso puede durar hasta 31 días.",
      field: "endsAt",
    });
    expect(await publishNoticeAction({}, notice({ code: "000000" }))).toMatchObject({ field: "code" });
    expect(await db.select().from(appNotice)).toEqual([]);
    expect(await events()).toEqual([]);
    expect(mocks.refresh).not.toHaveBeenCalled();
    // El código que no se gastó sigue sirviendo.
    expect(await publishNoticeAction({}, notice({ code: unused }))).toHaveProperty("message");
  });

  it("200 caracteres justos sí", async () => {
    const { code } = await seed();
    expect(await publishNoticeAction({}, notice({ message: "a".repeat(200), code: code() }))).toHaveProperty("message");
  });

  it("en inglés", async () => {
    const { code } = await seed();
    requestLocale.value = "en";
    expect((await publishNoticeAction({}, notice({ code: code() }))).message).toMatch(/^The notice was published: it shows until [A-Z][a-z]{2} \d+, \d{4}, /);
    // Los errores no gastan el código (ni lo revisan): sirve uno de mentira.
    expect(await publishNoticeAction({}, notice({ message: "", code: "000000" }))).toEqual({ error: "Write the notice.", field: "message" });
    expect(await removeNoticeAction({}, form({ code: code() }))).toEqual({ message: "The notice for everyone was removed." });
    expect(await removeNoticeAction({}, form({ code: "000000" }))).toEqual({ error: "There's no notice to remove." });
  });
});

describe("quitar el aviso", () => {
  it("con el código lo quita y el historial guarda cuál era", async () => {
    const { admin, code } = await seed();
    const end = inDays(3);
    await publishNoticeAction({}, notice({ message: "Nuevo: presupuestos", tone: "info", endsAt: end.input, code: code() }));
    expect(await removeNoticeAction({}, form({ code: code() }))).toEqual({ message: "Se quitó el aviso para todos." });
    expect(await getNoticeSettings()).toBeNull();
    expect((await events())[1]).toEqual({
      type: "notice_removed",
      userId: null,
      adminId: admin.id,
      details: { notice: { message: "Nuevo: presupuestos", tone: "info", endsAt: end.date.toISOString() } },
    });
  });

  it("sin aviso lo dice sin gastar el código; con un código equivocado no lo quita", async () => {
    const { code } = await seed();
    const unused = code();
    expect(await removeNoticeAction({}, form({ code: unused }))).toEqual({ error: "No hay ningún aviso para quitar." });
    await publishNoticeAction({}, notice({ code: unused }));
    expect(await removeNoticeAction({}, form({ code: "000000" }))).toMatchObject({ field: "code" });
    expect(await getNoticeSettings()).not.toBeNull();
  });

  it("uno vencido sigue en Configuración (sin verse) hasta quitarlo; Inicio ya no lo cuenta", async () => {
    const { code } = await seed();
    await db.insert(appNotice).values({ id: 1, message: "Viejo", tone: "info", endsAt: new Date(Date.now() - DAY) });
    expect(await getNoticeSettings()).toMatchObject({ message: "Viejo", active: false, published: { by: null } });
    expect(await noticeSummary()).toBeNull();
    expect(await removeNoticeAction({}, form({ code: code() }))).toHaveProperty("message");
  });
});

describe("sin rol de admin", () => {
  it("cada acción y consulta se detiene en requireAdmin", async () => {
    mocks.requireAdmin.mockReset().mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(publishNoticeAction({}, notice({ code: "123456" }))).rejects.toThrow();
    await expect(removeNoticeAction({}, form({ code: "123456" }))).rejects.toThrow();
    await expect(getNoticeSettings()).rejects.toThrow();
    await expect(noticeSummary()).rejects.toThrow();
    expect(await db.select().from(appNotice)).toEqual([]);
  });
});
