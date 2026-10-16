import "server-only";
import { asc, count, eq } from "drizzle-orm";
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
import { accountEvents, accountMessages, accountPhones } from "./delete-account";

// Consultas de los comandos de terminal (scripts/delete-data.ts y scripts/admin.ts): las usa el
// dueño de la app desde su computador, nunca la web (no validan ninguna sesión; la matriz de
// autorización impide importarlas desde src/app). Muestran qué se va a borrar o cambiar antes de
// pedir la confirmación.

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
  const phones = await accountPhones(account.id);
  const [[transactions], [categories], [messages], [events]] = await Promise.all([
    db.select({ n: count() }).from(transaction).where(eq(transaction.userId, account.id)),
    db.select({ n: count() }).from(category).where(eq(category.userId, account.id)),
    db.select({ n: count() }).from(whatsappMessage).where(accountMessages(account.id, phones)),
    db.select({ n: count() }).from(accountEvent).where(accountEvents(account.id, phones)),
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

// La limpieza de datos sin dueño vive en ./retention.ts (también la usa la limpieza diaria de la web).
export { countOrphanData, deleteOrphanData, type OrphanCounts } from "./retention";

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
