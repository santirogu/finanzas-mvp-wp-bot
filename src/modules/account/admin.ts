import "server-only";
import { and, asc, count, eq, isNull, lt, notExists } from "drizzle-orm";
import { db } from "@/db";
import {
  accountEvent,
  category,
  session,
  transaction,
  twoFactor,
  user,
  whatsappLink,
  whatsappMessage,
} from "@/db/schema";
import type { Role } from "@/lib/roles";
import { normalizeEmail } from "@/modules/auth/lockout";
import { accountEvents, accountMessages } from "./delete-account";

// Consultas para el comando de terminal scripts/delete-data.ts (lo usa el dueño de la app, no la
// web): muestran qué se va a borrar antes de pedir la confirmación.

export type AccountSummary = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  role: Role;
  createdAt: Date;
  transactions: number;
  categories: number;
  phone: string | null;
  messages: number;
  events: number;
};

/** La cuenta de ese correo y cuánto se borraría con ella (lo mismo que deleteAccountData). */
export async function findAccountByEmail(email: string): Promise<AccountSummary | null> {
  const [account] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.email, normalizeEmail(email)));
  if (!account) return null;

  const [link] = await db
    .select({ phone: whatsappLink.phone })
    .from(whatsappLink)
    .where(eq(whatsappLink.userId, account.id));
  const phone = link?.phone ?? null;
  const [[transactions], [categories], [messages], [events]] = await Promise.all([
    db.select({ n: count() }).from(transaction).where(eq(transaction.userId, account.id)),
    db.select({ n: count() }).from(category).where(eq(category.userId, account.id)),
    db.select({ n: count() }).from(whatsappMessage).where(accountMessages(account.id, phone)),
    db.select({ n: count() }).from(accountEvent).where(accountEvents(account.id, phone)),
  ]);

  return {
    ...account,
    transactions: transactions.n,
    categories: categories.n,
    phone,
    messages: messages.n,
    events: events.n,
  };
}

/**
 * Datos sin dueño anteriores a `before`: mensajes de WhatsApp e intentos fallidos de vinculación de
 * números que no están vinculados a ninguna cuenta. Si el número está vinculado, son de antes de
 * vincularlo y se borran con la cuenta.
 */
const unlinked = (phone: typeof whatsappMessage.phone | typeof accountEvent.phone) =>
  notExists(db.select().from(whatsappLink).where(eq(whatsappLink.phone, phone)));

function orphanMessages(before: Date) {
  return and(isNull(whatsappMessage.userId), lt(whatsappMessage.receivedAt, before), unlinked(whatsappMessage.phone));
}

function orphanEvents(before: Date) {
  return and(isNull(accountEvent.userId), lt(accountEvent.createdAt, before), unlinked(accountEvent.phone));
}

export type OrphanCounts = { messages: number; events: number; phones: number };

export async function countOrphanData(before: Date): Promise<OrphanCounts> {
  const [[messages], [events], messagePhones, eventPhones] = await Promise.all([
    db.select({ n: count() }).from(whatsappMessage).where(orphanMessages(before)),
    db.select({ n: count() }).from(accountEvent).where(orphanEvents(before)),
    db.selectDistinct({ phone: whatsappMessage.phone }).from(whatsappMessage).where(orphanMessages(before)),
    db.selectDistinct({ phone: accountEvent.phone }).from(accountEvent).where(orphanEvents(before)),
  ]);
  // Un mismo número puede tener mensajes e intentos: se cuenta una vez.
  const phones = new Set([...messagePhones, ...eventPhones].map((row) => row.phone));
  return { messages: messages.n, events: events.n, phones: phones.size };
}

/** Borra los datos sin dueño anteriores a `before` y devuelve cuántos borró. */
export async function deleteOrphanData(before: Date): Promise<{ messages: number; events: number }> {
  return db.transaction(async (tx) => {
    const messages = await tx.delete(whatsappMessage).where(orphanMessages(before)).returning({ id: whatsappMessage.id });
    const events = await tx.delete(accountEvent).where(orphanEvents(before)).returning({ id: accountEvent.id });
    return { messages: messages.length, events: events.length };
  });
}

// ── Roles (pnpm admin:grant / admin:revoke / admin:list / admin:reset-2fa) ──────────────────────

export type AccountRole = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  role: Role;
  twoFactorEnabled: boolean;
  createdAt: Date;
};

const accountRoleColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  timezone: user.timezone,
  role: user.role,
  twoFactorEnabled: user.twoFactorEnabled,
  createdAt: user.createdAt,
};

/** La cuenta de ese correo con su rol, o null si no existe. */
export async function findAccountRole(email: string): Promise<AccountRole | null> {
  const [account] = await db.select(accountRoleColumns).from(user).where(eq(user.email, normalizeEmail(email)));
  return account ?? null;
}

/** Cambia el rol de una cuenta; devuelve false si la cuenta ya no existe. */
export async function setRole(userId: string, role: Role): Promise<boolean> {
  const updated = await db.update(user).set({ role }).where(eq(user.id, userId)).returning({ id: user.id });
  return updated.length === 1;
}

/** Las cuentas con rol de admin, de la más antigua a la más nueva. */
export async function listAdmins(): Promise<AccountRole[]> {
  return db.select(accountRoleColumns).from(user).where(eq(user.role, "admin")).orderBy(asc(user.createdAt));
}

/**
 * Reinicia la verificación en dos pasos (si se perdió el celular y los códigos de respaldo): borra
 * la clave y los códigos, la desactiva y cierra todas las sesiones de la cuenta. Para volver a
 * administrar hay que entrar con la contraseña y configurarla de nuevo. Devuelve cuántas sesiones
 * cerró, o null si la cuenta ya no existe.
 */
export async function resetTwoFactor(userId: string): Promise<{ sessionsClosed: number } | null> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (updated.length === 0) return null;
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    const closed = await tx.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
    return { sessionsClosed: closed.length };
  });
}
