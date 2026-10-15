import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  accountEvent,
  adminCodeUse,
  category,
  loginFailure,
  session,
  transaction,
  twoFactor,
  user,
  whatsappLink,
  whatsappMessage,
} from "@/db/schema";
import { createUser } from "../../../../test/integration/factories";
import { createAdminWithTwoFactor } from "../../../../test/integration/two-factor";

// Las acciones del admin sobre una cuenta, con la base de verdad: qué cambian, qué registran en el
// historial (con el admin) y qué no tocan. Siempre con dos cuentas (Ana y Beto) para comprobar que
// solo cambia la elegida. La sesión se simula: la del admin de cada prueba.
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: auth.requireAdmin }));
const { deleteAccount, revokeSessions, unlinkWhatsApp, unlockLogin } = await import("./account-actions");

const NOW = new Date("2026-10-12T21:00:10Z");
const DAY = 24 * 60 * 60 * 1000;

async function seed() {
  const { admin, codeAt } = await createAdminWithTwoFactor();
  auth.requireAdmin.mockResolvedValue({ id: admin.id, role: "admin", twoFactorEnabled: true });
  const ana = await createUser({ name: "Ana Pérez", email: "Ana@Correo.com" });
  const beto = await createUser({ name: "Beto Ruiz", email: "beto@correo.com" });
  for (const [person, phone] of [
    [ana, "573001112233"],
    [beto, "573004445566"],
  ] as const) {
    await db.insert(whatsappLink).values({ userId: person.id, phone });
    // Bloqueados por contraseñas equivocadas hasta dentro de 10 minutos.
    await db.insert(loginFailure).values({
      email: person.email.toLowerCase(),
      failures: 5,
      firstFailureAt: NOW,
      lockedUntil: new Date(NOW.getTime() + 10 * 60_000),
    });
  }
  const addSession = (userId: string, expiresAt = new Date(NOW.getTime() + 7 * DAY)) =>
    db.insert(session).values({ id: randomUUID(), token: randomUUID(), userId, expiresAt });
  await addSession(ana.id);
  await addSession(ana.id);
  await addSession(ana.id, new Date(NOW.getTime() - DAY)); // vencida
  await addSession(beto.id);
  await addSession(admin.id);
  return { admin, codeAt, ana, beto };
}

const eventsOf = (userId: string | null) =>
  db
    .select({ type: accountEvent.type, phone: accountEvent.phone, details: accountEvent.details, adminId: accountEvent.adminId })
    .from(accountEvent)
    .where(userId ? eq(accountEvent.userId, userId) : undefined);
const lockOf = (email: string) => db.select().from(loginFailure).where(eq(loginFailure.email, email.toLowerCase()));
const sessionsOf = (userId: string) => db.select().from(session).where(eq(session.userId, userId));
const linkOf = (userId: string) => db.select().from(whatsappLink).where(eq(whatsappLink.userId, userId));
const codeUses = () => db.$count(adminCodeUse);

beforeEach(() => {
  auth.requireAdmin.mockReset();
});

describe("unlockLogin", () => {
  it("levanta el bloqueo de esa cuenta (y no el de la otra) y lo registra con el admin", async () => {
    const { admin, codeAt, ana, beto } = await seed();
    expect(await unlockLogin({ userId: ana.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: true,
      message: "Se desbloqueó el inicio de sesión de Ana Pérez.",
    });
    expect(await lockOf(ana.email)).toEqual([]);
    expect(await lockOf(beto.email)).toHaveLength(1);
    expect(await eventsOf(ana.id)).toEqual([{ type: "login_unlocked", phone: null, details: {}, adminId: admin.id }]);
    expect(await eventsOf(beto.id)).toEqual([]);
  });

  it("con un código equivocado no cambia nada", async () => {
    const { ana } = await seed();
    const result = await unlockLogin({ userId: ana.id, code: "000000" }, NOW);
    expect(result).toMatchObject({ ok: false, field: "code" });
    expect(await lockOf(ana.email)).toHaveLength(1);
    expect(await eventsOf(ana.id)).toEqual([]);
  });

  it("si la cuenta ya no está bloqueada, avisa sin gastar el código", async () => {
    const { codeAt, ana } = await seed();
    const after = new Date(NOW.getTime() + 11 * 60_000);
    expect(await unlockLogin({ userId: ana.id, code: codeAt(after) }, after)).toEqual({
      ok: false,
      error: "La cuenta ya no tiene el inicio de sesión bloqueado.",
    });
    expect(await codeUses()).toBe(0);
  });
});

describe("revokeSessions", () => {
  it("cierra todas las sesiones de esa cuenta, también las vencidas, y no las de nadie más", async () => {
    const { admin, codeAt, ana, beto } = await seed();
    expect(await revokeSessions({ userId: ana.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: true,
      message: "Se cerraron las 2 sesiones de Ana Pérez.",
    });
    expect(await sessionsOf(ana.id)).toEqual([]);
    expect(await sessionsOf(beto.id)).toHaveLength(1);
    expect(await sessionsOf(admin.id)).toHaveLength(1);
    // Su WhatsApp sigue vinculado.
    expect(await linkOf(ana.id)).toHaveLength(1);
    expect(await eventsOf(ana.id)).toEqual([
      { type: "sessions_revoked", phone: null, details: { sessions: 2 }, adminId: admin.id },
    ]);
  });

  it("con una sola sesión, lo dice en singular", async () => {
    const { codeAt, beto } = await seed();
    expect(await revokeSessions({ userId: beto.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: true,
      message: "Se cerró la sesión de Beto Ruiz.",
    });
  });

  it("con solo sesiones vencidas tampoco hay nada que cerrar", async () => {
    const { codeAt } = await seed();
    const carla = await createUser({ name: "Carla" });
    await db.insert(session).values({ id: randomUUID(), token: randomUUID(), userId: carla.id, expiresAt: new Date(NOW.getTime() - 1000) });
    expect(await revokeSessions({ userId: carla.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: false,
      error: "La cuenta ya no tiene sesiones abiertas.",
    });
    expect(await sessionsOf(carla.id)).toHaveLength(1);
  });

  it("sin sesiones abiertas, avisa sin gastar el código", async () => {
    const { codeAt } = await seed();
    const carla = await createUser({ name: "Carla" });
    expect(await revokeSessions({ userId: carla.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: false,
      error: "La cuenta ya no tiene sesiones abiertas.",
    });
    expect(await codeUses()).toBe(0);
  });
});

describe("unlinkWhatsApp", () => {
  it("desvincula el número de esa cuenta y lo registra como hecho por el admin", async () => {
    const { admin, codeAt, ana, beto } = await seed();
    expect(await unlinkWhatsApp({ userId: ana.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: true,
      message: "Se desvinculó el WhatsApp de Ana Pérez.",
    });
    expect(await linkOf(ana.id)).toEqual([]);
    expect(await linkOf(beto.id)).toHaveLength(1);
    expect(await eventsOf(ana.id)).toEqual([
      { type: "whatsapp_unlinked", phone: "573001112233", details: { reason: "by_admin" }, adminId: admin.id },
    ]);
    // Sus sesiones siguen abiertas.
    expect(await sessionsOf(ana.id)).toHaveLength(3);
  });

  it("sin WhatsApp vinculado, avisa sin gastar el código", async () => {
    const { codeAt } = await seed();
    const carla = await createUser({ name: "Carla" });
    expect(await unlinkWhatsApp({ userId: carla.id, code: codeAt(NOW) }, NOW)).toEqual({
      ok: false,
      error: "La cuenta ya no tiene un WhatsApp vinculado.",
    });
    expect(await codeUses()).toBe(0);
  });
});

describe("deleteAccount", () => {
  async function withData(userId: string, phone: string) {
    const [own] = await db.insert(category).values({ userId, name: `Propia ${userId}`, type: "expense" }).returning();
    await db.insert(transaction).values({
      userId,
      type: "expense",
      amount: 10_000,
      categoryId: own.id,
      description: "almuerzo",
      occurredOn: "2026-10-12",
      source: "web",
    });
    await db.insert(whatsappMessage).values({ id: `wamid.${randomUUID()}`, phone, userId, body: "gasté 10 mil" });
    await db.insert(accountEvent).values({ type: "registered", userId });
  }

  it("borra la cuenta y todos sus datos; en el historial queda solo 'account_deleted' con el admin", async () => {
    const { admin, codeAt, ana, beto } = await seed();
    await withData(ana.id, "573001112233");
    await withData(beto.id, "573004445566");

    // El correo se compara sin mayúsculas ni espacios.
    expect(await deleteAccount({ userId: ana.id, code: codeAt(NOW), email: "  ana@correo.COM " }, NOW)).toEqual({
      ok: true,
      message: "Se eliminó la cuenta.",
    });
    expect(await db.select().from(user).where(eq(user.id, ana.id))).toEqual([]);
    for (const table of [session, whatsappLink, transaction, category]) {
      expect(await db.select().from(table).where(eq(table.userId, ana.id))).toEqual([]);
    }
    expect(await db.select().from(whatsappMessage).where(eq(whatsappMessage.phone, "573001112233"))).toEqual([]);
    expect(await lockOf(ana.email)).toEqual([]);
    expect(await eventsOf(null).then((rows) => rows.filter((r) => r.type === "account_deleted"))).toEqual([
      { type: "account_deleted", phone: null, details: {}, adminId: admin.id },
    ]);
    // Del historial de Ana no queda nada más, y nada dice quién era.
    const all = await db.select().from(accountEvent);
    expect(JSON.stringify(all)).not.toContain(ana.id);
    expect(JSON.stringify(all)).not.toContain("573001112233");

    // Beto, intacto.
    expect(await db.select().from(user).where(eq(user.id, beto.id))).toHaveLength(1);
    expect(await db.select().from(transaction).where(eq(transaction.userId, beto.id))).toHaveLength(1);
    expect(await sessionsOf(beto.id)).toHaveLength(1);
  });

  it("si el correo no coincide, no borra nada ni gasta el código", async () => {
    const { codeAt, ana } = await seed();
    expect(await deleteAccount({ userId: ana.id, code: codeAt(NOW), email: "beto@correo.com" }, NOW)).toEqual({
      ok: false,
      error: "El correo no coincide con el de la cuenta.",
      field: "email",
    });
    expect(await db.select().from(user).where(eq(user.id, ana.id))).toHaveLength(1);
    expect(await codeUses()).toBe(0);
  });

  it("con un código equivocado no borra nada", async () => {
    const { ana } = await seed();
    expect(await deleteAccount({ userId: ana.id, code: "000000", email: ana.email }, NOW)).toMatchObject({
      ok: false,
      field: "code",
    });
    expect(await db.select().from(user).where(eq(user.id, ana.id))).toHaveLength(1);
  });
});

describe("las cuentas que no se tocan", () => {
  type Run = (userId: string, code: string) => Promise<unknown>;
  const actions: [string, Run][] = [
    ["unlockLogin", (userId, code) => unlockLogin({ userId, code }, NOW)],
    ["revokeSessions", (userId, code) => revokeSessions({ userId, code }, NOW)],
    ["unlinkWhatsApp", (userId, code) => unlinkWhatsApp({ userId, code }, NOW)],
    ["deleteAccount", (userId, code) => deleteAccount({ userId, code, email: "" }, NOW)],
  ];

  it.each(actions)("%s: ni la del propio admin", async (_, run) => {
    const { admin, codeAt } = await seed();
    await db.insert(loginFailure).values({ email: admin.email, failures: 5, firstFailureAt: NOW, lockedUntil: new Date(NOW.getTime() + 60_000) });
    await db.insert(whatsappLink).values({ userId: admin.id, phone: "573009990000" });
    expect(await run(admin.id, codeAt(NOW))).toEqual({ ok: false, error: "Para tu propia cuenta usa Mi cuenta o Seguridad." });
    expect(await db.select().from(user).where(eq(user.id, admin.id))).toHaveLength(1);
    expect(await sessionsOf(admin.id)).toHaveLength(1);
    expect(await codeUses()).toBe(0);
  });

  it.each(actions)("%s: ni la de otro admin", async (_, run) => {
    const { codeAt } = await seed();
    const other = await createUser({ name: "Otro Admin", role: "admin", twoFactorEnabled: true });
    await db.insert(session).values({ id: randomUUID(), token: randomUUID(), userId: other.id, expiresAt: new Date(NOW.getTime() + DAY) });
    expect(await run(other.id, codeAt(NOW))).toEqual({
      ok: false,
      error: "Las cuentas de admin no se cambian desde aquí: los roles se manejan desde la terminal.",
    });
    expect(await sessionsOf(other.id)).toHaveLength(1);
    expect(await codeUses()).toBe(0);
  });

  it.each(actions)("%s: ni una que no existe o un id raro", async (_, run) => {
    const { codeAt } = await seed();
    for (const id of ["no-existe", "", "../admin", "' or 1=1 --"]) {
      expect(await run(id, codeAt(NOW)), id).toEqual({ ok: false, error: "Esta cuenta ya no existe." });
    }
    expect(await codeUses()).toBe(0);
  });

  it.each(actions.slice(0, 3))("%s: con un código equivocado no cambia nada y lo cuenta como intento", async (_, run) => {
    const { admin, ana } = await seed();
    expect(await run(ana.id, "000000")).toMatchObject({ ok: false, field: "code", error: expect.stringMatching(/^El código no es correcto/) });
    expect(await lockOf(ana.email)).toHaveLength(1);
    expect(await sessionsOf(ana.id)).toHaveLength(3);
    expect(await linkOf(ana.id)).toHaveLength(1);
    expect(await eventsOf(ana.id)).toEqual([]);
    const [factor] = await db.select({ failures: twoFactor.failedVerificationCount }).from(twoFactor).where(eq(twoFactor.userId, admin.id));
    expect(factor.failures).toBe(1);
  });

  it.each(actions)("%s: sin admin falla antes de tocar nada", async (_, run) => {
    const { codeAt, ana } = await seed();
    auth.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(run(ana.id, codeAt(NOW))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await db.select().from(user).where(eq(user.id, ana.id))).toHaveLength(1);
    expect(await lockOf(ana.email)).toHaveLength(1);
    expect(await sessionsOf(ana.id)).toHaveLength(3);
    expect(await linkOf(ana.id)).toHaveLength(1);
    expect(await eventsOf(ana.id)).toEqual([]);
  });
});

describe("un código por acción", () => {
  it("dos acciones seguidas necesitan dos códigos distintos", async () => {
    const { codeAt, ana } = await seed();
    const code = codeAt(NOW);
    expect(await unlockLogin({ userId: ana.id, code }, NOW)).toMatchObject({ ok: true });
    expect(await unlinkWhatsApp({ userId: ana.id, code }, NOW)).toEqual({
      ok: false,
      error: "Ese código ya se usó. Espera el siguiente en Google Authenticator.",
      field: "code",
    });
    expect(await linkOf(ana.id)).toHaveLength(1);
    const next = new Date(NOW.getTime() + 30_000);
    expect(await unlinkWhatsApp({ userId: ana.id, code: codeAt(next) }, next)).toMatchObject({ ok: true });
  });
});
