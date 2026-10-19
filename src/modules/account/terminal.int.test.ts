import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { accountEvent, category, session, transaction, twoFactor, user, whatsappLink, whatsappMessage } from "@/db/schema";
import { createUser } from "../../../test/integration/factories";
import { createAdminWithTwoFactor } from "../../../test/integration/two-factor";
import { countOrphanData, deleteOrphanData, findAccountByEmail, findAccountRole, listAdmins, setRole, setSuperAdmin } from "./terminal";
import { deleteAccountData } from "./delete-account";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function message(id: string, phone: string, { userId = null as string | null, age = 40 } = {}) {
  await db.insert(whatsappMessage).values({ id, phone, userId, body: "hola", receivedAt: daysAgo(age) });
}

async function failedAttempt(phone: string, { userId = null as string | null, age = 40 } = {}) {
  const [row] = await db
    .insert(accountEvent)
    .values({ type: "whatsapp_link_failed", userId, phone, details: { reason: "invalid_code" }, createdAt: daysAgo(age) })
    .returning({ id: accountEvent.id });
  return row.id;
}

const eventPhones = async () => (await db.select({ phone: accountEvent.phone }).from(accountEvent)).map((e) => e.phone).sort();

const messageIds = async () => (await db.select({ id: whatsappMessage.id }).from(whatsappMessage)).map((m) => m.id).sort();

describe("findAccountByEmail", () => {
  it("resume lo que se borraría y coincide con lo que borra deleteAccountData", async () => {
    const ana = await createUser({ email: "ana@test.local", name: "Ana" });
    const [own] = await db
      .insert(category)
      .values({ userId: ana.id, type: "expense", name: "Propia", emoji: "x" })
      .returning();
    await db.insert(transaction).values([
      { userId: ana.id, type: "expense", amount: 1000, description: "a", occurredOn: "2026-10-10", categoryId: own.id },
      { userId: ana.id, type: "income", amount: 2000, description: "b", occurredOn: "2026-10-11" },
    ]);
    await db.insert(whatsappLink).values({ userId: ana.id, phone: "573001112233" });
    await message("antes-de-vincular", "573001112233");
    await message("despues", "573001112233", { userId: ana.id });
    await message("otro-numero", "573009998877");
    // Historial: su registro y un intento fallido desde su número antes de vincularlo (sin cuenta).
    await db.insert(accountEvent).values({ type: "registered", userId: ana.id });
    await failedAttempt("573001112233");
    await failedAttempt("573009998877");

    const summary = await findAccountByEmail("  Ana@Test.LOCAL ");
    expect(summary).toEqual({
      id: ana.id,
      name: "Ana",
      email: "ana@test.local",
      timezone: "America/Bogota",
      role: "user",
      createdAt: expect.any(Date),
      transactions: 2,
      categories: 1,
      phone: "573001112233",
      messages: 2,
      events: 2,
    });

    await deleteAccountData(ana.id);
    expect(await messageIds()).toEqual(["otro-numero"]);
    expect(await eventPhones()).toEqual(["573009998877"]);
    expect(await findAccountByEmail("ana@test.local")).toBeNull();
  });

  it("sin número vinculado cuenta solo los mensajes asociados a la cuenta", async () => {
    const beto = await createUser({ email: "beto@test.local" });
    await message("de-beto", "573005550000", { userId: beto.id });
    await message("mismo-numero-sin-cuenta", "573005550000");

    expect(await findAccountByEmail("beto@test.local")).toMatchObject({
      transactions: 0,
      categories: 0,
      phone: null,
      messages: 1,
      events: 0,
    });
  });

  it("no encuentra correos que no existen ni los parecidos", async () => {
    await createUser({ email: "caro@test.local" });
    expect(await findAccountByEmail("nadie@test.local")).toBeNull();
    expect(await findAccountByEmail("caro@test")).toBeNull();
  });
});

describe("datos sin dueño", () => {
  it("cuenta y borra solo los viejos, sin cuenta y de números no vinculados", async () => {
    const ana = await createUser();
    await db.insert(whatsappLink).values({ userId: ana.id, phone: "573001112233" });

    await message("huerfano-1", "573009998877");
    await message("huerfano-2", "573009998877", { age: 31 });
    await message("huerfano-otro", "573004443322");
    await message("huerfano-reciente", "573009998877", { age: 5 });
    await message("vinculado-antes", "573001112233");
    await message("con-cuenta", "573006667788", { userId: ana.id });
    // Intentos fallidos de vinculación: el de un número nuevo cuenta como otro número.
    await failedAttempt("573009998877");
    await failedAttempt("573005550000", { age: 45 });
    await failedAttempt("573009998877", { age: 3 });
    await failedAttempt("573001112233");
    await failedAttempt("573006667788", { userId: ana.id });

    const before = daysAgo(30);
    expect(await countOrphanData(before)).toEqual({ messages: 3, events: 2, phones: 3 });
    expect(await deleteOrphanData(before)).toEqual({ messages: 3, events: 2 });
    expect(await messageIds()).toEqual(["con-cuenta", "huerfano-reciente", "vinculado-antes"]);
    expect(await eventPhones()).toEqual(["573001112233", "573006667788", "573009998877"]);

    expect(await countOrphanData(before)).toEqual({ messages: 0, events: 0, phones: 0 });
    expect(await deleteOrphanData(before)).toEqual({ messages: 0, events: 0 });
  });

  it("no toca cuentas, su historial ni otros datos", async () => {
    const ana = await createUser();
    await db.insert(transaction).values({
      userId: ana.id,
      type: "expense",
      amount: 1000,
      description: "a",
      occurredOn: "2026-10-10",
    });
    await db.insert(accountEvent).values({ type: "registered", userId: ana.id, createdAt: daysAgo(400) });
    await message("huerfano", "573009998877");

    await deleteOrphanData(daysAgo(30));

    expect(await db.select().from(user).where(eq(user.id, ana.id))).toHaveLength(1);
    expect(await db.select().from(transaction).where(eq(transaction.userId, ana.id))).toHaveLength(1);
    expect(await db.select().from(accountEvent).where(eq(accountEvent.userId, ana.id))).toHaveLength(1);
  });
});

describe("roles desde la terminal", () => {
  const addSessions = (userId: string) =>
    db.insert(session).values([
      { id: randomUUID(), token: randomUUID(), userId, expiresAt: new Date(Date.now() + DAY) },
      { id: randomUUID(), token: randomUUID(), userId, expiresAt: daysAgo(1) },
    ]);
  const stateOf = async (userId: string) =>
    (await db.select({ role: user.role, superAdmin: user.superAdmin, twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId)))[0];

  it("dar el rol cierra sus sesiones (cuenta solo las abiertas), como desde la app", async () => {
    const ana = await createUser();
    await addSessions(ana.id);
    expect(await setRole(ana.id, "admin")).toEqual({ sessionsClosed: 1 });
    expect(await stateOf(ana.id)).toEqual({ role: "admin", superAdmin: false, twoFactorEnabled: false });
    expect(await db.select().from(session).where(eq(session.userId, ana.id))).toEqual([]);
  });

  it("quitarlo borra su verificación, sus sesiones y la marca de super admin; sus finanzas quedan", async () => {
    const { admin } = await createAdminWithTwoFactor({ superAdmin: true });
    await addSessions(admin.id);
    await db.insert(transaction).values({ userId: admin.id, type: "income", amount: 1000, description: "Pago", occurredOn: "2026-10-01" });
    expect(await setRole(admin.id, "user")).toEqual({ sessionsClosed: 1 });
    expect(await stateOf(admin.id)).toEqual({ role: "user", superAdmin: false, twoFactorEnabled: false });
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, admin.id))).toEqual([]);
    expect(await db.select().from(transaction).where(eq(transaction.userId, admin.id))).toHaveLength(1);
  });

  it("con una cuenta que no existe devuelve null", async () => {
    expect(await setRole("no-existe", "admin")).toBeNull();
    expect(await setRole("no-existe", "user")).toBeNull();
  });

  it("la marca de super admin pasa de una cuenta a otra (hay una sola)", async () => {
    const ana = await createUser({ role: "admin", superAdmin: true });
    const beto = await createUser({ role: "admin" });
    expect(await setSuperAdmin(beto.id)).toBe(true);
    expect(await stateOf(beto.id)).toMatchObject({ superAdmin: true });
    expect(await stateOf(ana.id)).toMatchObject({ role: "admin", superAdmin: false });
    // Marcar otra vez a la misma no cambia nada.
    expect(await setSuperAdmin(beto.id)).toBe(true);
    expect((await listAdmins()).filter((a) => a.superAdmin).map((a) => a.id)).toEqual([beto.id]);
    expect(await findAccountRole(beto.email)).toMatchObject({ superAdmin: true });
  });

  it("solo a un admin: a un usuario (o a una cuenta que no existe) no, y no le quita la marca a nadie", async () => {
    const ana = await createUser({ role: "admin", superAdmin: true });
    const beto = await createUser();
    expect(await setSuperAdmin(beto.id)).toBe(false);
    expect(await setSuperAdmin("no-existe")).toBe(false);
    expect(await stateOf(ana.id)).toMatchObject({ superAdmin: true });
    expect(await stateOf(beto.id)).toMatchObject({ superAdmin: false });
  });

  it("la base no admite dos super admins", async () => {
    await createUser({ role: "admin", superAdmin: true });
    await expect(createUser({ role: "admin", superAdmin: true })).rejects.toThrow();
  });
});
