import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  account,
  accountEvent,
  category,
  fixedExpenseChoice,
  loginFailure,
  session,
  transaction,
  user,
  whatsappLink,
  whatsappLinkCode,
  whatsappMessage,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { accountPhones, deleteAccountData } from "./delete-account";

/** Una cuenta real (Better Auth: usuario, credenciales y sesión) con datos en todas las tablas. */
/** Una cuenta recién registrada (sin número ni datos) y su id. */
async function signUp(email: string) {
  await auth.api.signUpEmail({ body: { name: "Persona", email, password: "clave-segura-123" } });
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return row.id;
}

async function fullAccount(email: string, phone: string) {
  await auth.api.signUpEmail({ body: { name: "Persona", email, password: "clave-segura-123" } });
  const [row] = await db.select().from(user).where(eq(user.email, email));
  const id = row.id;

  const [personal] = await db
    .insert(category)
    .values({ userId: id, type: "expense", name: `Propia ${email}`, emoji: "x" })
    .returning();
  await db.insert(transaction).values([
    { userId: id, type: "expense", amount: 1000, description: "Web", occurredOn: "2026-10-10", categoryId: personal.id },
    { userId: id, type: "expense", amount: 2000, description: "Bot", occurredOn: "2026-10-11", source: "whatsapp", externalId: `wamid.${phone}:0` },
  ]);
  await db.insert(whatsappLink).values({ userId: id, phone });
  await db.insert(whatsappLinkCode).values({ userId: id, codeHash: `hash-${phone}`, expiresAt: new Date(Date.now() + 60_000) });
  await db.insert(whatsappMessage).values([
    // Antes de vincular, los mensajes del número no tienen usuario.
    { id: `wamid.${phone}.antes`, phone, body: "VINCULAR 123456", status: "processed", receivedAt: new Date() },
    { id: `wamid.${phone}.despues`, phone, body: "gasté 2 mil", status: "processed", userId: id, receivedAt: new Date() },
  ]);
  await db.insert(loginFailure).values({ email, failures: 2, firstFailureAt: new Date() });
  // Un gasto fijo marcado a mano en Reportes.
  await db.insert(fixedExpenseChoice).values({ userId: id, descriptionKey: "web", choice: "include" });
  return id;
}

async function countsFor(userId: string, email: string, phone: string) {
  const count = async (rows: Promise<unknown[]>) => (await rows).length;
  return {
    user: await count(db.select().from(user).where(eq(user.id, userId))),
    session: await count(db.select().from(session).where(eq(session.userId, userId))),
    account: await count(db.select().from(account).where(eq(account.userId, userId))),
    transaction: await count(db.select().from(transaction).where(eq(transaction.userId, userId))),
    category: await count(db.select().from(category).where(eq(category.userId, userId))),
    whatsappLink: await count(db.select().from(whatsappLink).where(eq(whatsappLink.userId, userId))),
    whatsappLinkCode: await count(db.select().from(whatsappLinkCode).where(eq(whatsappLinkCode.userId, userId))),
    whatsappMessage: await count(db.select().from(whatsappMessage).where(eq(whatsappMessage.phone, phone))),
    loginFailure: await count(db.select().from(loginFailure).where(eq(loginFailure.email, email))),
    fixedExpenseChoice: await count(db.select().from(fixedExpenseChoice).where(eq(fixedExpenseChoice.userId, userId))),
  };
}

describe("deleteAccountData", () => {
  it("borra la cuenta y todos sus datos, incluidos los mensajes de WhatsApp y los intentos fallidos", async () => {
    const id = await fullAccount("ana@test.local", "573001112233");
    const before = await countsFor(id, "ana@test.local", "573001112233");
    expect(before).toEqual({
      user: 1,
      session: 1,
      account: 1,
      transaction: 2,
      category: 1,
      whatsappLink: 1,
      whatsappLinkCode: 1,
      whatsappMessage: 2,
      loginFailure: 1,
      fixedExpenseChoice: 1,
    });

    await deleteAccountData(id);

    expect(await countsFor(id, "ana@test.local", "573001112233")).toEqual({
      user: 0,
      session: 0,
      account: 0,
      transaction: 0,
      category: 0,
      whatsappLink: 0,
      whatsappLinkCode: 0,
      whatsappMessage: 0,
      loginFailure: 0,
      fixedExpenseChoice: 0,
    });
  });

  it("no toca nada de otro usuario", async () => {
    const ana = await fullAccount("ana@test.local", "573001112233");
    const beto = await fullAccount("beto@test.local", "573009998877");
    const betoBefore = await countsFor(beto, "beto@test.local", "573009998877");

    await deleteAccountData(ana);

    expect(await countsFor(beto, "beto@test.local", "573009998877")).toEqual(betoBefore);
  });

  it("sin número vinculado borra igual sus mensajes y el resto", async () => {
    const id = await fullAccount("caro@test.local", "573005550000");
    await db.delete(whatsappLink).where(eq(whatsappLink.userId, id));

    await deleteAccountData(id);

    const remaining = await db.select().from(whatsappMessage).where(eq(whatsappMessage.phone, "573005550000"));
    // El mensaje de antes de vincular ya no se puede asociar a la cuenta (no hay número vinculado).
    expect(remaining.map((m) => m.id)).toEqual(["wamid.573005550000.antes"]);
    expect(await db.select().from(user).where(eq(user.id, id))).toEqual([]);
  });

  it("borra también lo que llegó sin cuenta desde los números que tuvo antes", async () => {
    const id = await signUp("ana@test.local");
    // Escribió desde A antes de vincularlo, lo vinculó, se cambió a B y escribió desde B.
    await db.insert(whatsappMessage).values({ id: "wamid.antesA", phone: "573001110000", body: "gasté 80 mil en farmacia" });
    await db.insert(accountEvent).values([
      { type: "whatsapp_link_failed", phone: "573001110000", details: { reason: "invalid_code" } },
      { type: "whatsapp_linked", userId: id, phone: "573001110000" },
      { type: "whatsapp_unlinked", userId: id, phone: "573001110000", details: { reason: "number_changed" } },
      { type: "whatsapp_linked", userId: id, phone: "573002220000" },
    ]);
    await db.insert(whatsappLink).values({ userId: id, phone: "573002220000" });
    await db.insert(whatsappMessage).values({ id: "wamid.antesB", phone: "573002220000", body: "hola" });

    expect(await accountPhones(id)).toEqual(["573001110000", "573002220000"]);
    await deleteAccountData(id);

    expect(await db.select().from(whatsappMessage)).toEqual([]);
    expect(await db.select().from(accountEvent)).toEqual([]);
  });

  it("de un número que tuvo y hoy es de otra cuenta, no borra lo de la otra persona", async () => {
    const ana = await signUp("ana@test.local");
    const beto = await signUp("beto@test.local");
    // El número pasó de Ana a Beto. Lo que llegó sin cuenta y lo de Beto se quedan.
    await db.insert(accountEvent).values([
      { type: "whatsapp_linked", userId: ana, phone: "573003330000" },
      { type: "whatsapp_unlinked", userId: ana, phone: "573003330000", details: { reason: "number_moved" } },
      { type: "whatsapp_linked", userId: beto, phone: "573003330000" },
      { type: "whatsapp_link_failed", phone: "573003330000", details: { reason: "invalid_code" } },
    ]);
    await db.insert(whatsappLink).values({ userId: beto, phone: "573003330000" });
    await db.insert(whatsappMessage).values([
      { id: "wamid.ana", phone: "573003330000", body: "de Ana", userId: ana },
      { id: "wamid.beto", phone: "573003330000", body: "de Beto", userId: beto },
      { id: "wamid.sin", phone: "573003330000", body: "sin cuenta" },
    ]);

    expect(await accountPhones(ana)).toEqual([]);
    await deleteAccountData(ana);

    expect((await db.select({ id: whatsappMessage.id }).from(whatsappMessage)).map((row) => row.id).sort()).toEqual([
      "wamid.beto",
      "wamid.sin",
    ]);
    const events = await db.select({ type: accountEvent.type, userId: accountEvent.userId }).from(accountEvent);
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "whatsapp_linked", userId: beto },
        { type: "whatsapp_link_failed", userId: null },
      ]),
    );
    expect(events.some((event) => event.userId === ana)).toBe(false);
  });

  it("con el número vinculado, no borra los mensajes de ese número que son de otra cuenta", async () => {
    const ana = await signUp("ana@test.local");
    const beto = await signUp("beto@test.local");
    await db.insert(whatsappLink).values({ userId: ana, phone: "573004440000" });
    // El número fue de Beto antes de pasar a Ana: sus mensajes siguen siendo de Beto.
    await db.insert(whatsappMessage).values({ id: "wamid.beto", phone: "573004440000", body: "de Beto", userId: beto });

    await deleteAccountData(ana);

    expect((await db.select({ id: whatsappMessage.id }).from(whatsappMessage)).map((row) => row.id)).toEqual(["wamid.beto"]);
  });

  it("si la cuenta ya no existe, no hace nada", async () => {
    await expect(deleteAccountData("no-existe")).resolves.toBe(false);
    await expect(deleteAccountData("no-existe", { deletedBy: "alguien" })).resolves.toBe(false);
    expect(await db.select().from(accountEvent)).toEqual([]);
  });

  it("si la borra el admin, queda solo 'account_deleted' con el admin y sin datos de la cuenta", async () => {
    const id = await fullAccount("eli@test.local", "573005550000");
    const [admin] = await db.insert(user).values({ id: "admin-1", name: "Ana Admin", email: "admin@test.local", role: "admin" }).returning();

    await expect(deleteAccountData(id, { deletedBy: admin.id })).resolves.toBe(true);

    expect(await db.select({ type: accountEvent.type, userId: accountEvent.userId, phone: accountEvent.phone, adminId: accountEvent.adminId, details: accountEvent.details }).from(accountEvent)).toEqual([
      { type: "account_deleted", userId: null, phone: null, adminId: "admin-1", details: {} },
    ]);
  });

  it("si la borra la propia persona (o el comando), no queda nada en el historial", async () => {
    const id = await fullAccount("sola@test.local", "573005551111");
    await expect(deleteAccountData(id)).resolves.toBe(true);
    expect(await db.select().from(accountEvent)).toEqual([]);
  });

  it("borra los intentos fallidos aunque el correo tenga mayúsculas", async () => {
    await auth.api.signUpEmail({ body: { name: "Dani", email: "Dani@Test.local", password: "clave-segura-123" } });
    const [row] = await db.select().from(user).where(eq(user.email, "dani@test.local"));
    await db.insert(loginFailure).values({ email: "dani@test.local", failures: 1, firstFailureAt: new Date() });

    await deleteAccountData(row.id);

    expect(await db.select().from(loginFailure).where(eq(loginFailure.email, "dani@test.local"))).toEqual([]);
  });
});
