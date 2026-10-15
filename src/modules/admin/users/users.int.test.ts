import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, loginFailure, session, user, whatsappLink } from "@/db/schema";
import { createUser } from "../../../../test/integration/factories";
import { parseUserFilters } from "./user-filters";

// Las consultas validan el rol ellas mismas (requireAdmin): aquí la sesión se simula; por defecto,
// la de un admin con la verificación activa.
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: auth.requireAdmin }));
const { getUserDetail, listUsers, usersSummary } = await import("./users");

beforeEach(() => {
  auth.requireAdmin.mockReset().mockResolvedValue({ id: "admin", role: "admin", twoFactorEnabled: true });
});

// Usuarios con la base de verdad: filtros, "ver más", el detalle de una cuenta (solo sus sesiones
// abiertas y sus eventos, nunca el token) y búsquedas raras. "Ahora" es el 12 de octubre de 2026,
// 4:00 p. m. en Colombia.

const TODAY = "2026-10-12";
const NOW = new Date("2026-10-12T21:00:00Z");
const at = (iso: string) => new Date(iso);
const list = (params: Record<string, string | string[]> = {}) => listUsers(parseUserFilters(params), TODAY, NOW);
const names = (page: Awaited<ReturnType<typeof list>>) => page.users.map((u) => u.name);

const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

async function addSession(userId: string, values: Partial<typeof session.$inferInsert> = {}) {
  const token = `token-${randomUUID()}`;
  const [row] = await db
    .insert(session)
    .values({ id: randomUUID(), token, userId, expiresAt: at("2026-11-01T00:00:00Z"), ...values })
    .returning();
  return row;
}

async function seed() {
  const ana = await createUser({ name: "Ana Pérez", email: "ana@correo.com", createdAt: at("2026-10-01T15:00:00Z") });
  // Registrada el 9 de octubre a las 11:30 p. m. en Colombia (ya el 10 en UTC).
  const beto = await createUser({
    name: "Beto 100%_real",
    email: "Beto@Otro.co",
    role: "admin",
    twoFactorEnabled: true,
    createdAt: at("2026-10-10T04:30:00Z"),
  });
  const carla = await createUser({ name: "Carla Ríos", email: "carla@correo.com", createdAt: at("2026-10-12T20:00:00Z") });

  await db.insert(whatsappLink).values({ userId: ana.id, phone: "573001112233", linkedAt: at("2026-10-02T15:01:00Z") });
  const anaOpen = await addSession(ana.id, {
    createdAt: at("2026-10-03T12:00:00Z"),
    updatedAt: at("2026-10-11T12:00:00Z"),
    ipAddress: "181.50.12.3",
    userAgent: CHROME_ANDROID,
  });
  // Vencida: no es una sesión abierta, pero sí el inicio de sesión más reciente que queda guardado.
  const anaExpired = await addSession(ana.id, {
    createdAt: at("2026-10-05T12:00:00Z"),
    expiresAt: at("2026-10-06T12:00:00Z"),
    ipAddress: "10.0.0.1",
  });
  const betoSession = await addSession(beto.id, { createdAt: at("2026-10-11T08:00:00Z"), ipAddress: "2800:00e2:004a:1234:0000:0000:0000:0000" });

  // El bloqueo va por correo en minúsculas: el de Beto sigue vigente; el de Carla ya pasó.
  await db.insert(loginFailure).values([
    { email: "beto@otro.co", failures: 5, firstFailureAt: at("2026-10-12T20:50:00Z"), lockedUntil: at("2026-10-12T21:05:00Z") },
    { email: "carla@correo.com", failures: 5, firstFailureAt: at("2026-10-12T20:00:00Z"), lockedUntil: at("2026-10-12T20:15:00Z") },
  ]);

  await db.insert(accountEvent).values([
    { type: "registered", userId: ana.id, createdAt: at("2026-10-01T15:00:00Z") },
    { type: "whatsapp_linked", userId: ana.id, phone: "573001112233", createdAt: at("2026-10-02T15:01:00Z") },
    { type: "registered", userId: beto.id, createdAt: at("2026-10-10T04:30:00Z") },
    { type: "whatsapp_link_failed", userId: null, phone: "573009998877", details: { reason: "invalid_code" } },
  ]);
  return { ana, beto, carla, anaOpen, anaExpired, betoSession };
}

describe("listUsers", () => {
  it("muestra todas las cuentas, de la más nueva a la más vieja, con su WhatsApp, bloqueo e inicio de sesión", async () => {
    const { ana, beto, carla } = await seed();
    const page = await list();

    expect(page).toMatchObject({ total: 3, hasMore: false });
    expect(names(page)).toEqual(["Carla Ríos", "Beto 100%_real", "Ana Pérez"]);
    expect(page.users).toEqual([
      {
        id: carla.id,
        name: "Carla Ríos",
        email: "carla@correo.com",
        role: "user",
        createdAt: at("2026-10-12T20:00:00Z"),
        phone: null,
        // Su bloqueo ya pasó.
        lockedUntil: null,
        lastSignInAt: null,
      },
      {
        id: beto.id,
        name: "Beto 100%_real",
        email: "Beto@Otro.co",
        role: "admin",
        createdAt: at("2026-10-10T04:30:00Z"),
        phone: null,
        lockedUntil: at("2026-10-12T21:05:00Z"),
        lastSignInAt: at("2026-10-11T08:00:00Z"),
      },
      {
        id: ana.id,
        name: "Ana Pérez",
        email: "ana@correo.com",
        role: "user",
        createdAt: at("2026-10-01T15:00:00Z"),
        phone: "573001112233",
        lockedUntil: null,
        lastSignInAt: at("2026-10-05T12:00:00Z"),
      },
    ]);
  });

  it("filtra por rol", async () => {
    await seed();
    expect(names(await list({ rol: "admin" }))).toEqual(["Beto 100%_real"]);
    expect(names(await list({ rol: "user" }))).toEqual(["Carla Ríos", "Ana Pérez"]);
    expect(names(await list({ rol: "todos" }))).toHaveLength(3);
  });

  it("filtra por WhatsApp vinculado o sin vincular", async () => {
    await seed();
    expect(names(await list({ whatsapp: "si" }))).toEqual(["Ana Pérez"]);
    expect(names(await list({ whatsapp: "no" }))).toEqual(["Carla Ríos", "Beto 100%_real"]);
    expect(names(await list({ whatsapp: "todos" }))).toHaveLength(3);
  });

  it("filtra las cuentas con el inicio de sesión bloqueado ahora (no las que ya se desbloquearon)", async () => {
    await seed();
    const page = await list({ estado: "bloqueadas" });
    expect(names(page)).toEqual(["Beto 100%_real"]);
    expect(page.total).toBe(1);
    // Un minuto después de que vence, ya no.
    expect((await listUsers(parseUserFilters({ estado: "bloqueadas" }), TODAY, at("2026-10-12T21:06:00Z"))).users).toEqual([]);
  });

  it("la fecha de registro va en la hora de Colombia", async () => {
    await seed();
    expect(names(await list({ fecha: "hoy" }))).toEqual(["Carla Ríos"]);
    expect(names(await list({ fecha: "7d" }))).toEqual(["Carla Ríos", "Beto 100%_real"]);
    expect(names(await list({ fecha: "personalizado", desde: "2026-10-09", hasta: "2026-10-09" }))).toEqual(["Beto 100%_real"]);
    expect(names(await list({ fecha: "personalizado", desde: "2026-10-10", hasta: "2026-10-11" }))).toEqual([]);
    expect(names(await list({ fecha: "personalizado", hasta: "2026-10-01" }))).toEqual(["Ana Pérez"]);
  });

  it("'Últimos 30 días' incluye el día 30 (contando hoy) y no el 31, en la hora de Colombia", async () => {
    await seed();
    // 13 de septiembre a las 0:00 en Colombia (el día 30) y 12 de septiembre a las 11:59 p. m. (el 31).
    await createUser({ name: "Día 30", createdAt: at("2026-09-13T05:00:00Z") });
    await createUser({ name: "Día 31", createdAt: at("2026-09-13T04:59:00Z") });
    expect(names(await list({ fecha: "30d" }))).toEqual(["Carla Ríos", "Beto 100%_real", "Ana Pérez", "Día 30"]);
    expect(names(await list({ fecha: "todo" }))).toHaveLength(5);
  });

  it("el rango personalizado acepta solo 'Desde' y se ordena si viene al revés", async () => {
    await seed();
    expect(names(await list({ fecha: "personalizado", desde: "2026-10-10" }))).toEqual(["Carla Ríos"]);
    expect(names(await list({ fecha: "personalizado", desde: "2026-10-09" }))).toEqual(["Carla Ríos", "Beto 100%_real"]);
    expect(names(await list({ fecha: "personalizado", desde: "2026-10-12", hasta: "2026-10-09" }))).toEqual([
      "Carla Ríos",
      "Beto 100%_real",
    ]);
    // Sin ninguna fecha válida, es "Todo".
    expect(names(await list({ fecha: "personalizado", desde: "2026-02-31" }))).toHaveLength(3);
  });

  it("busca por nombre, correo o número (con o sin espacios y +)", async () => {
    await seed();
    expect(names(await list({ q: "ANA" }))).toEqual(["Ana Pérez"]);
    expect(names(await list({ q: "otro.co" }))).toEqual(["Beto 100%_real"]);
    expect(names(await list({ q: "correo.com" }))).toEqual(["Carla Ríos", "Ana Pérez"]);
    expect(names(await list({ q: "+57 300 111" }))).toEqual(["Ana Pérez"]);
    expect(names(await list({ q: "2233" }))).toEqual(["Ana Pérez"]);
  });

  it("los % y _ de la búsqueda se buscan tal cual; nada de lo que se escriba rompe la consulta", async () => {
    await seed();
    expect(names(await list({ q: "100%" }))).toEqual(["Beto 100%_real"]);
    expect(names(await list({ q: "%_" }))).toEqual(["Beto 100%_real"]);
    expect(names(await list({ q: "%" }))).toEqual(["Beto 100%_real"]);
    expect(names(await list({ q: "_" }))).toEqual(["Beto 100%_real"]);
    expect(names(await list({ q: "a\\" }))).toEqual([]);
    for (const q of ["' or 1=1 --", '"; drop table "user"; --', "ñ".repeat(100)]) {
      await expect(list({ q }), q).resolves.toMatchObject({ users: [] });
    }
    // Un carácter nulo en la URL (?q=%00), que Postgres no acepta en un texto, se quita.
    expect(names(await list({ q: `an${String.fromCharCode(0)}a` }))).toEqual(["Ana Pérez"]);
    expect(await db.$count(user)).toBe(3);
  });

  it("combina los filtros", async () => {
    await seed();
    expect(names(await list({ rol: "user", whatsapp: "no" }))).toEqual(["Carla Ríos"]);
    expect(names(await list({ rol: "user", q: "correo", fecha: "hoy" }))).toEqual(["Carla Ríos"]);
    expect(names(await list({ rol: "admin", estado: "bloqueadas", whatsapp: "si" }))).toEqual([]);
  });

  it('muestra de a 50 y "ver más" suma las siguientes, sin repetir ni saltarse cuentas', async () => {
    const start = Date.parse("2026-09-01T00:00:00Z");
    await db.insert(user).values(
      Array.from({ length: 55 }, (_, i) => ({
        id: `cuenta-${String(i).padStart(2, "0")}`,
        name: `Cuenta ${i}`,
        email: `cuenta${i}@test.local`,
        // Dos a la vez: el orden se desempata por id.
        createdAt: new Date(start + Math.floor(i / 2) * 3_600_000),
      })),
    );

    const first = await list();
    expect(first).toMatchObject({ total: 55, hasMore: true });
    expect(first.users).toHaveLength(50);
    const all = await list({ mostrar: "100" });
    expect(all).toMatchObject({ total: 55, hasMore: false });
    expect(all.users.slice(0, 50)).toEqual(first.users);
    expect(new Set(all.users.map((u) => u.id)).size).toBe(55);
    expect(all.users[0].id).toBe("cuenta-54");
    expect(all.users.at(-1)!.id).toBe("cuenta-00");
  });

  it("sin cuentas, una lista vacía", async () => {
    expect(await list()).toEqual({ users: [], total: 0, hasMore: false });
  });
});

describe("getUserDetail", () => {
  it("una cuenta con sus datos, sus sesiones abiertas y sus eventos", async () => {
    const { ana, anaOpen } = await seed();
    const detail = await getUserDetail(ana.id, NOW);

    expect(detail).toEqual({
      id: ana.id,
      name: "Ana Pérez",
      email: "ana@correo.com",
      role: "user",
      createdAt: at("2026-10-01T15:00:00Z"),
      phone: "573001112233",
      linkedAt: at("2026-10-02T15:01:00Z"),
      lockedUntil: null,
      lastSignInAt: at("2026-10-05T12:00:00Z"),
      twoFactorEnabled: false,
      // Solo la que no ha vencido.
      sessions: [
        {
          id: anaOpen.id,
          createdAt: at("2026-10-03T12:00:00Z"),
          expiresAt: at("2026-11-01T00:00:00Z"),
          ipAddress: "181.50.12.3",
          userAgent: CHROME_ANDROID,
        },
      ],
      sessionCount: 1,
      events: [
        {
          id: expect.any(String),
          type: "whatsapp_linked",
          phone: "573001112233",
          details: {},
          createdAt: at("2026-10-02T15:01:00Z"),
          account: { name: "Ana Pérez", email: "ana@correo.com" },
        },
        {
          id: expect.any(String),
          type: "registered",
          phone: null,
          details: {},
          createdAt: at("2026-10-01T15:00:00Z"),
          account: { name: "Ana Pérez", email: "ana@correo.com" },
        },
      ],
    });
  });

  it("nunca devuelve el token de las sesiones (con él se podría usar la sesión)", async () => {
    const { ana, anaOpen } = await seed();
    const detail = await getUserDetail(ana.id, NOW);
    expect(detail!.sessions[0]).not.toHaveProperty("token");
    expect(JSON.stringify(detail)).not.toContain(anaOpen.token);
  });

  it("con dos cuentas, cada detalle tiene solo lo suyo", async () => {
    const { ana, beto, anaOpen, betoSession } = await seed();
    const ofBeto = await getUserDetail(beto.id, NOW);
    expect(ofBeto).toMatchObject({
      name: "Beto 100%_real",
      role: "admin",
      twoFactorEnabled: true,
      phone: null,
      linkedAt: null,
      lockedUntil: at("2026-10-12T21:05:00Z"),
      sessionCount: 1,
    });
    expect(ofBeto!.sessions.map((s) => s.id)).toEqual([betoSession.id]);
    expect(ofBeto!.events.map((e) => e.type)).toEqual(["registered"]);

    const ofAna = await getUserDetail(ana.id, NOW);
    expect(ofAna!.sessions.map((s) => s.id)).toEqual([anaOpen.id]);
    expect(ofAna!.events.every((e) => e.account?.email === "ana@correo.com")).toBe(true);
    // El intento fallido sin cuenta no es de nadie.
    expect([...ofAna!.events, ...ofBeto!.events].map((e) => e.type)).not.toContain("whatsapp_link_failed");
  });

  it("muestra hasta 20 sesiones abiertas, las usadas más recientemente, y cuenta todas", async () => {
    const { carla } = await seed();
    for (let i = 0; i < 25; i++) {
      await addSession(carla.id, { id: `s-${String(i).padStart(2, "0")}`, updatedAt: new Date(Date.parse("2026-10-11T00:00:00Z") + i * 60_000) });
    }
    const detail = await getUserDetail(carla.id, NOW);
    expect(detail!.sessionCount).toBe(25);
    expect(detail!.sessions).toHaveLength(20);
    expect(detail!.sessions[0].id).toBe("s-24");
    expect(detail!.sessions.at(-1)!.id).toBe("s-05");
  });

  it("muestra los últimos 10 eventos", async () => {
    const { carla } = await seed();
    await db.insert(accountEvent).values(
      Array.from({ length: 12 }, (_, i) => ({
        type: "whatsapp_code_created" as const,
        userId: carla.id,
        createdAt: new Date(Date.parse("2026-10-12T20:00:00Z") + i * 60_000),
      })),
    );
    const detail = await getUserDetail(carla.id, NOW);
    expect(detail!.events).toHaveLength(10);
    expect(detail!.events[0].createdAt).toEqual(at("2026-10-12T20:11:00Z"));
  });

  it.each(["no-existe", "../admin", "a b", "' or 1=1 --", "", "x".repeat(65)])("con el id %j: null", async (id) => {
    await seed();
    expect(await getUserDetail(id, NOW)).toBeNull();
  });

  it("una cuenta eliminada ya no aparece", async () => {
    const { ana } = await seed();
    await db.delete(user).where(eq(user.id, ana.id));
    expect(await getUserDetail(ana.id, NOW)).toBeNull();
    expect(names(await list())).not.toContain("Ana Pérez");
  });
});

describe("usersSummary", () => {
  it("cuenta las cuentas y cuántas tienen WhatsApp", async () => {
    expect(await usersSummary()).toEqual({ total: 0, withWhatsApp: 0 });
    await seed();
    expect(await usersSummary()).toEqual({ total: 3, withWhatsApp: 1 });
  });
});

describe("sin admin no hay datos", () => {
  it.each([
    ["sin sesión (lleva al login)", new Error("NEXT_REDIRECT:/login")],
    ["un usuario (404)", new Error("NEXT_NOT_FOUND")],
    ["un admin sin verificación (lleva a configurarla)", new Error("NEXT_REDIRECT:/admin/seguridad")],
  ])("%s: las consultas fallan antes de devolver nada", async (_, error) => {
    const { ana } = await seed();
    auth.requireAdmin.mockRejectedValue(error);
    await expect(list()).rejects.toThrow(error.message);
    await expect(getUserDetail(ana.id, NOW)).rejects.toThrow(error.message);
    // También con un id inválido: la validación del rol va primero.
    await expect(getUserDetail("../x", NOW)).rejects.toThrow(error.message);
    await expect(usersSummary()).rejects.toThrow(error.message);
  });

  it("cada consulta valida el rol una vez por llamada", async () => {
    const { ana } = await seed();
    await list();
    await getUserDetail(ana.id, NOW);
    await usersSummary();
    expect(auth.requireAdmin).toHaveBeenCalledTimes(3);
  });
});
