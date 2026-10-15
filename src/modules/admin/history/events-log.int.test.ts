import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, user } from "@/db/schema";
import { createUser } from "../../../../test/integration/factories";

// Las consultas validan el rol ellas mismas (requireAdmin): aquí la sesión se simula; por defecto,
// la de un admin con la verificación activa.
const session = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: session.requireAdmin }));
const { historySummary, listAccountEvents } = await import("./events-log");

beforeEach(() => {
  session.requireAdmin.mockReset().mockResolvedValue({ id: "admin", role: "admin", twoFactorEnabled: true });
});
import { ADMIN_LOG_MAX, ADMIN_LOG_PAGE_SIZE, parseLogFilters } from "./log-filters";

// El historial de /admin con la base de verdad: todas las cuentas, filtros, "ver más" y búsquedas
// raras (que nunca deben romper la consulta ni saltarse los filtros). "Hoy" es el 12 de octubre de
// 2026 en Colombia, salvo que la prueba diga otra cosa.

const TODAY = "2026-10-12";
const list = (params: Record<string, string | string[]> = {}, today = TODAY) =>
  listAccountEvents(parseLogFilters(params), today);

type NewEvent = typeof accountEvent.$inferInsert;
const at = (iso: string) => new Date(iso);

async function seed() {
  const ana = await createUser({ name: "Ana Pérez", email: "ana@correo.com" });
  const beto = await createUser({ name: "Beto 100%_real", email: "beto@otro.co" });
  const events: NewEvent[] = [
    { type: "registered", userId: ana.id, createdAt: at("2026-10-01T15:00:00Z") },
    { type: "whatsapp_code_created", userId: ana.id, createdAt: at("2026-10-02T15:00:00Z") },
    { type: "whatsapp_linked", userId: ana.id, phone: "573001112233", createdAt: at("2026-10-02T15:01:00Z") },
    { type: "registered", userId: beto.id, createdAt: at("2026-10-10T04:30:00Z") }, // 9 oct 11:30 p. m. en Bogotá
    { type: "whatsapp_link_failed", userId: null, phone: "573009998877", details: { reason: "invalid_code" }, createdAt: at("2026-10-10T05:30:00Z") }, // 10 oct 0:30 a. m.
    { type: "whatsapp_unlinked", userId: ana.id, phone: "573001112233", details: { reason: "by_user" }, createdAt: at("2026-10-12T20:00:00Z") },
  ];
  await db.insert(accountEvent).values(events);
  return { ana, beto };
}

const types = (page: Awaited<ReturnType<typeof list>>) => page.entries.map((e) => e.type);

describe("listAccountEvents", () => {
  it("muestra los eventos de todas las cuentas, del más nuevo al más viejo, con nombre y correo", async () => {
    const { ana } = await seed();
    const page = await list();

    expect(page).toMatchObject({ total: 6, hasMore: false });
    expect(types(page)).toEqual([
      "whatsapp_unlinked",
      "whatsapp_link_failed",
      "registered",
      "whatsapp_linked",
      "whatsapp_code_created",
      "registered",
    ]);
    expect(page.entries[0]).toEqual({
      id: expect.any(String),
      type: "whatsapp_unlinked",
      phone: "573001112233",
      details: { reason: "by_user" },
      createdAt: at("2026-10-12T20:00:00Z"),
      account: { name: "Ana Pérez", email: "ana@correo.com" },
    });
    // El intento fallido no tiene cuenta.
    expect(page.entries[1].account).toBeNull();
    expect(page.entries.filter((e) => e.account?.email === ana.email)).toHaveLength(4);
  });

  it("filtra por uno o varios tipos de evento", async () => {
    await seed();
    expect(types(await list({ tipo: "registered" }))).toEqual(["registered", "registered"]);
    expect((await list({ tipo: "whatsapp_link_failed" })).entries.map((e) => e.phone)).toEqual(["573009998877"]);
    expect(types(await list({ tipo: ["whatsapp_linked", "whatsapp_unlinked"] }))).toEqual([
      "whatsapp_unlinked",
      "whatsapp_linked",
    ]);
    // Un tipo desconocido se ignora (no filtra nada).
    expect((await list({ tipo: "otra_cosa" })).total).toBe(6);
  });

  it.each([
    ["ana", 4],
    ["ANA@CORREO", 4],
    ["Pérez", 4],
    ["otro.co", 1],
    ["573009998877", 1],
    ["+57 300 999 8877", 1],
    ["300-111", 2],
    ["nadie", 0],
  ])("busca %j en nombre, correo o número: %i eventos", async (q, expected) => {
    await seed();
    expect((await list({ q })).total).toBe(expected);
  });

  it("los % y _ de la búsqueda se buscan tal cual, no como comodines", async () => {
    await seed();
    expect((await list({ q: "100%_" })).total).toBe(1);
    expect((await list({ q: "%" })).total).toBe(1);
    expect((await list({ q: "_" })).total).toBe(1);
    expect((await list({ q: "a%a" })).total).toBe(0);
    // Un carácter nulo en la URL (?q=%00) no rompe la consulta: se quita.
    expect((await list({ q: `ana${String.fromCharCode(0)}` })).total).toBe(4);
  });

  it.each([`' or '1'='1`, `"; drop table account_event; --`, "\\", "'", "ñandú 🙂"])(
    "una búsqueda rara (%j) no rompe nada ni se salta el filtro",
    async (q) => {
      await seed();
      const page = await list({ q });
      expect(page.total).toBe(0);
      expect(await db.select().from(accountEvent)).toHaveLength(6);
      expect(await db.select().from(user)).toHaveLength(2);
    },
  );

  it("el rango personalizado va en la hora de Colombia, con los dos días incluidos", async () => {
    await seed();
    const range = (desde?: string, hasta?: string) =>
      list({ fecha: "personalizado", ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) });
    // El registro de Beto fue el 9 de octubre a las 11:30 p. m. en Bogotá (10 en UTC).
    expect(types(await range("2026-10-10", "2026-10-10"))).toEqual(["whatsapp_link_failed"]);
    expect(types(await range("2026-10-09", "2026-10-09"))).toEqual(["registered"]);
    expect((await range("2026-10-02")).total).toBe(5);
    expect((await range(undefined, "2026-10-02")).total).toBe(3);
    expect((await range("2026-10-02", "2026-10-01")).total).toBe(3);
    expect((await range("2026-11-01")).total).toBe(0);
    // Sin fecha=personalizado, desde y hasta no cuentan.
    expect((await list({ desde: "2026-11-01" })).total).toBe(6);
  });

  it("los atajos de fecha cuentan desde hoy en Colombia", async () => {
    await seed();
    // Hoy = 12 de octubre.
    expect(types(await list({ fecha: "hoy" }))).toEqual(["whatsapp_unlinked"]);
    // 7 días: del 6 al 12.
    expect(types(await list({ fecha: "7d" }))).toEqual(["whatsapp_unlinked", "whatsapp_link_failed", "registered"]);
    // 30 días: del 13 de septiembre al 12 de octubre.
    expect((await list({ fecha: "30d" })).total).toBe(6);
    // Visto desde el 10 de octubre, "hoy" es solo el intento de las 0:30 a. m.
    expect(types(await list({ fecha: "hoy" }, "2026-10-10"))).toEqual(["whatsapp_link_failed"]);
    expect((await list({ fecha: "hoy" }, "2026-11-01")).total).toBe(0);
  });

  it("combina los filtros", async () => {
    await seed();
    expect(types(await list({ tipo: "registered", q: "beto", fecha: "7d" }))).toEqual(["registered"]);
    expect((await list({ tipo: "registered", q: "ana", fecha: "7d" })).total).toBe(0);
    expect((await list({ tipo: ["registered", "whatsapp_link_failed"], fecha: "personalizado", desde: "2026-10-09" })).total).toBe(2);
  });

  it(`muestra de a ${ADMIN_LOG_PAGE_SIZE} y "ver más" suma los siguientes, sin repetir ni saltarse eventos`, async () => {
    const ana = await createUser();
    const start = Date.parse("2026-10-01T00:00:00Z");
    await db.insert(accountEvent).values(
      Array.from({ length: ADMIN_LOG_PAGE_SIZE * 2 + 3 }, (_, i) => ({
        type: "whatsapp_code_created" as const,
        userId: ana.id,
        // Algunos con la misma hora: el orden igual es estable (por id).
        createdAt: new Date(start + Math.floor(i / 2) * 60_000),
      })),
    );

    const first = await list();
    const more = await list({ mostrar: "100" });
    const all = await list({ mostrar: "150" });

    expect([first, more, all].map((p) => [p.entries.length, p.total, p.hasMore])).toEqual([
      [50, 103, true],
      [100, 103, true],
      [103, 103, false],
    ]);
    // "Ver más" conserva los de antes, en el mismo orden.
    expect(more.entries.slice(0, 50).map((e) => e.id)).toEqual(first.entries.map((e) => e.id));
    expect(all.entries.slice(0, 100).map((e) => e.id)).toEqual(more.entries.map((e) => e.id));
    expect(new Set(all.entries.map((e) => e.id)).size).toBe(103);
    const times = all.entries.map((e) => e.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it(`nunca muestra más de ${ADMIN_LOG_MAX}`, async () => {
    const ana = await createUser();
    await db.insert(accountEvent).values(
      Array.from({ length: ADMIN_LOG_MAX + 5 }, () => ({ type: "whatsapp_code_created" as const, userId: ana.id })),
    );
    const page = await list({ mostrar: "99999" });
    expect(page.entries).toHaveLength(ADMIN_LOG_MAX);
    expect(page).toMatchObject({ total: ADMIN_LOG_MAX + 5, hasMore: true });
  });

  it("sin eventos, una lista vacía", async () => {
    expect(await list()).toEqual({ entries: [], total: 0, hasMore: false });
  });

  it("los eventos de una cuenta borrada ya no aparecen", async () => {
    const { ana } = await seed();
    await db.delete(user).where(eq(user.id, ana.id));
    expect((await list()).entries.map((e) => e.account?.email ?? null)).toEqual([null, "beto@otro.co"]);
  });
});

describe("historySummary", () => {
  it("cuenta los eventos de hoy (en Colombia) y cuántos fueron intentos fallidos", async () => {
    await seed();
    // El 10 de octubre en Colombia: el intento fallido de las 0:30 a. m. (el registro de Beto fue el 9).
    expect(await historySummary("2026-10-10")).toEqual({ today: 1, failedToday: 1 });
    expect(await historySummary("2026-10-12")).toEqual({ today: 1, failedToday: 0 });
    expect(await historySummary("2026-11-01")).toEqual({ today: 0, failedToday: 0 });
  });
});

describe("sin admin no hay datos", () => {
  it.each([
    ["sin sesión (lleva al login)", new Error("NEXT_REDIRECT:/login")],
    ["un usuario (404)", new Error("NEXT_NOT_FOUND")],
    ["un admin sin verificación (lleva a configurarla)", new Error("NEXT_REDIRECT:/admin/seguridad")],
  ])("%s: las consultas fallan antes de devolver nada", async (_, error) => {
    await seed();
    session.requireAdmin.mockRejectedValue(error);
    await expect(list()).rejects.toThrow(error.message);
    await expect(historySummary(TODAY)).rejects.toThrow(error.message);
  });

  it("cada consulta valida el rol una vez por llamada", async () => {
    await list();
    await historySummary(TODAY);
    expect(session.requireAdmin).toHaveBeenCalledTimes(2);
  });
});
