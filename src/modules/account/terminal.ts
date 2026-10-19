import "server-only";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
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
import { hasRole, type Role } from "@/lib/roles";
import { normalizeEmail } from "@/modules/auth/lockout";
import { grantAdminRole, revokeAdminRole } from "./admin-role";
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

// ── Roles (pnpm admin:grant / admin:revoke / admin:super / admin:list / admin:reset-2fa) ─────────

export type AccountRole = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  role: Role;
  /** La marca de super admin (una sola cuenta la tiene). */
  superAdmin: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
};

const accountRoleColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  timezone: user.timezone,
  role: user.role,
  superAdmin: user.superAdmin,
  twoFactorEnabled: user.twoFactorEnabled,
  createdAt: user.createdAt,
};

/** La cuenta de ese correo con su rol, o null si no existe. */
export async function findAccountRole(email: string): Promise<AccountRole | null> {
  const [account] = await db.select(accountRoleColumns).from(user).where(eq(user.email, normalizeEmail(email)));
  return account ?? null;
}

/**
 * Cambia el rol de una cuenta, igual que el super admin desde la app (src/modules/account/admin-role.ts):
 * darlo cierra sus sesiones; quitarlo, además, borra su verificación en dos pasos y la marca de super
 * admin. Devuelve cuántas sesiones abiertas cerró, o null si la cuenta ya no existe.
 */
export async function setRole(userId: string, role: Role): Promise<{ sessionsClosed: number } | null> {
  return db.transaction((tx) => (hasRole(role, "admin") ? grantAdminRole(userId, { tx }) : revokeAdminRole(userId, { tx })));
}

/**
 * La marca de super admin pasa a esta cuenta (y se le quita a quien la tuviera: hay una sola). Solo a
 * un admin: devuelve false, sin cambiar nada, si la cuenta ya no existe o ya no es admin.
 */
export async function setSuperAdmin(userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Una marca a la vez: si dos corren juntas (dos terminales, o el recorrido de diseño con dos
    // navegadores), las dos verían que no hay otra marcada y la segunda chocaría con el índice único.
    // El candado dura hasta el final de la transacción.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('user_super_admin'))`);
    // Bloqueada hasta terminar: que nadie le quite el rol mientras tanto.
    const [target] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.role, "admin")))
      .for("update");
    if (!target) return false;
    await tx.update(user).set({ superAdmin: false }).where(and(eq(user.superAdmin, true), ne(user.id, userId)));
    await tx.update(user).set({ superAdmin: true }).where(eq(user.id, userId));
    return true;
  });
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
