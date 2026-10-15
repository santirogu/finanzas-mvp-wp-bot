import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { accountEvent, user } from "@/db/schema";
import { createUser } from "../../../test/integration/factories";
import { listAccountEvents } from "./events-log";
import { ADMIN_LOG_PAGE_SIZE, parseLogFilters } from "./log-filters";

// La lista de /admin con la base de verdad: todas las cuentas, filtros, paginación y búsquedas
// raras (que nunca deben romper la consulta ni saltarse los filtros).

const list = (params: Record<string, string> = {}) => listAccountEvents(parseLogFilters(params));

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

    expect(page).toMatchObject({ total: 6, page: 1, pageCount: 1 });
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

  it("filtra por tipo de evento", async () => {
    await seed();
    expect(types(await list({ tipo: "registered" }))).toEqual(["registered", "registered"]);
    expect((await list({ tipo: "whatsapp_link_failed" })).entries.map((e) => e.phone)).toEqual(["573009998877"]);
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

  it("filtra por fechas en la hora de Colombia, con los dos días incluidos", async () => {
    await seed();
    // El registro de Beto fue el 9 de octubre a las 11:30 p. m. en Bogotá (10 en UTC).
    expect(types(await list({ desde: "2026-10-10", hasta: "2026-10-10" }))).toEqual(["whatsapp_link_failed"]);
    expect(types(await list({ desde: "2026-10-09", hasta: "2026-10-09" }))).toEqual(["registered"]);
    expect((await list({ desde: "2026-10-02" })).total).toBe(5);
    expect((await list({ hasta: "2026-10-02" })).total).toBe(3);
    expect((await list({ desde: "2026-10-02", hasta: "2026-10-01" })).total).toBe(3);
    expect((await list({ desde: "2026-11-01" })).total).toBe(0);
  });

  it("combina los filtros", async () => {
    await seed();
    expect(types(await list({ tipo: "registered", q: "beto", desde: "2026-10-09" }))).toEqual(["registered"]);
    expect((await list({ tipo: "registered", q: "ana", desde: "2026-10-09" })).total).toBe(0);
  });

  it(`pagina de a ${ADMIN_LOG_PAGE_SIZE}, sin repetir ni saltarse eventos`, async () => {
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

    const pages = [await list(), await list({ pagina: "2" }), await list({ pagina: "3" })];

    expect(pages.map((p) => [p.page, p.pageCount, p.entries.length])).toEqual([
      [1, 3, 50],
      [2, 3, 50],
      [3, 3, 3],
    ]);
    const ids = pages.flatMap((p) => p.entries.map((e) => e.id));
    expect(new Set(ids).size).toBe(103);
    const times = pages.flatMap((p) => p.entries.map((e) => e.createdAt.getTime()));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("una página que no existe muestra la última", async () => {
    await seed();
    expect(await list({ pagina: "99" })).toMatchObject({ page: 1, pageCount: 1, total: 6 });
  });

  it("sin eventos, una sola página vacía", async () => {
    expect(await list()).toEqual({ entries: [], total: 0, page: 1, pageCount: 1 });
  });

  it("los eventos de una cuenta borrada ya no aparecen", async () => {
    const { ana } = await seed();
    await db.delete(user).where(eq(user.id, ana.id));
    expect((await list()).entries.map((e) => e.account?.email ?? null)).toEqual([null, "beto@otro.co"]);
  });
});
