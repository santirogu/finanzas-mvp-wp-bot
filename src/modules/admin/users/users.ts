import "server-only";
import { and, count, desc, eq, gt, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { accountEvent, loginFailure, session, user, whatsappLink } from "@/db/schema";
import { todayInTimezone } from "@/lib/dates";
import type { Role } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import type { LogEntry } from "../history/events-log";
import { ADMIN_TIMEZONE, dateRange, escapeLike, searchDigits } from "../shared/filters";
import { inDayRange, isAdminActionSql } from "../shared/sql";
import { isValidUserId, type UserFilters } from "./user-filters";

// Usuarios (/admin/usuarios): las cuentas, para consultar. Cada consulta valida el rol ella misma
// (requireAdmin), además de la página que la usa; la matriz de autorización lo exige. Solo datos de
// la cuenta, sus sesiones y su historial: nada de montos, movimientos ni mensajes (/privacidad).

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** La marca de super admin (vale con el rol de admin: isSuperAdmin, src/lib/roles.ts). */
  superAdmin: boolean;
  createdAt: Date;
  /** El número de WhatsApp vinculado, o null. */
  phone: string | null;
  /** Hasta cuándo tiene bloqueado el inicio de sesión por intentos fallidos; null si no lo está. */
  lockedUntil: Date | null;
  /** El inicio de sesión más reciente que sigue guardado (al cerrar sesión, se borra). */
  lastSignInAt: Date | null;
  /** Desde cuándo está suspendida por el admin; null si no lo está. */
  suspendedAt: Date | null;
};

export type UserPage = { users: UserRow[]; total: number; hasMore: boolean };

export type UserSession = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

export type UserDetail = UserRow & {
  twoFactorEnabled: boolean;
  /** El motivo que escribió el admin al suspenderla (interno). */
  suspensionReason: string | null;
  linkedAt: Date | null;
  /** Las sesiones abiertas (sin vencer), de la usada más recientemente (Better Auth la renueva cada 24 h de uso) a la menos. */
  sessions: UserSession[];
  /** Cuántas sesiones abiertas tiene (se muestran como mucho DETAIL_SESSIONS). */
  sessionCount: number;
  /** Los últimos eventos de su historial (como mucho DETAIL_EVENTS). */
  events: LogEntry[];
  /** Las últimas acciones del admin sobre la cuenta (como mucho DETAIL_EVENTS). */
  adminActions: LogEntry[];
};

// La cuenta del admin que hizo cada acción.
const adminUser = alias(user, "admin_user");

const DETAIL_SESSIONS = 20;
const DETAIL_EVENTS = 10;

// El bloqueo va por correo, en minúsculas (src/modules/auth/lockout.ts).
const lockOf = eq(loginFailure.email, sql`lower(${user.email})`);
const lastSignIn = sql<Date | null>`(select max(${session.createdAt}) from ${session} where ${session.userId} = ${user.id})`.mapWith(
  session.createdAt,
);
const columns = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  superAdmin: user.superAdmin,
  createdAt: user.createdAt,
  phone: whatsappLink.phone,
  lockedUntil: loginFailure.lockedUntil,
  lastSignInAt: lastSignIn,
  suspendedAt: user.suspendedAt,
};

/** Un bloqueo que ya pasó no cuenta (la fila se borra en el siguiente intento o login). */
const activeLock = (lockedUntil: Date | null, now: Date) => (lockedUntil && lockedUntil > now ? lockedUntil : null);

function where(filters: UserFilters, today: string, now: Date): SQL | undefined {
  const conditions: (SQL | undefined)[] = inDayRange(user.createdAt, dateRange(filters, today));
  if (filters.role) conditions.push(eq(user.role, filters.role));
  if (filters.whatsapp !== null) conditions.push(filters.whatsapp ? isNotNull(whatsappLink.id) : isNull(whatsappLink.id));
  if (filters.locked) conditions.push(gt(loginFailure.lockedUntil, now));
  if (filters.suspended) conditions.push(isNotNull(user.suspendedAt));
  if (filters.search) {
    const text = `%${escapeLike(filters.search)}%`;
    const digits = searchDigits(filters.search);
    conditions.push(
      or(
        ilike(user.name, text),
        ilike(user.email, text),
        ilike(whatsappLink.phone, text),
        // "+57 300 111" encuentra 573001112233.
        digits.length >= 3 ? ilike(whatsappLink.phone, `%${digits}%`) : undefined,
      ),
    );
  }
  return and(...conditions);
}

/**
 * Las primeras `filters.limit` cuentas que cumplen los filtros, de la más nueva a la más vieja.
 * `today` (YYYY-MM-DD en Colombia) es el día desde el que cuentan "Hoy", "Últimos 7 días"…
 */
export async function listUsers(
  filters: UserFilters,
  today = todayInTimezone(ADMIN_TIMEZONE),
  now = new Date(),
): Promise<UserPage> {
  await requireAdmin();
  const condition = where(filters, today, now);
  const [{ total }] = await db
    .select({ total: count() })
    .from(user)
    .leftJoin(whatsappLink, eq(whatsappLink.userId, user.id))
    .leftJoin(loginFailure, lockOf)
    .where(condition);

  const rows = await db
    .select(columns)
    .from(user)
    .leftJoin(whatsappLink, eq(whatsappLink.userId, user.id))
    .leftJoin(loginFailure, lockOf)
    .where(condition)
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(filters.limit);

  return {
    users: rows.map((row) => ({ ...row, lockedUntil: activeLock(row.lockedUntil, now) })),
    total,
    hasMore: total > rows.length,
  };
}

/** Una cuenta con sus sesiones abiertas y sus últimos eventos; null si no existe. */
export async function getUserDetail(id: string, now = new Date()): Promise<UserDetail | null> {
  await requireAdmin();
  if (!isValidUserId(id)) return null;
  const [row] = await db
    .select({
      ...columns,
      twoFactorEnabled: user.twoFactorEnabled,
      suspensionReason: user.suspensionReason,
      linkedAt: whatsappLink.linkedAt,
    })
    .from(user)
    .leftJoin(whatsappLink, eq(whatsappLink.userId, user.id))
    .leftJoin(loginFailure, lockOf)
    .where(eq(user.id, id));
  if (!row) return null;

  const open = and(eq(session.userId, id), gt(session.expiresAt, now));
  // Nunca el token: con él se podría usar la sesión.
  const sessions = await db
    .select({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(open)
    .orderBy(desc(session.updatedAt), desc(session.id))
    .limit(DETAIL_SESSIONS);
  const [{ sessionCount }] = await db.select({ sessionCount: count() }).from(session).where(open);

  const events = (onlyAdminActions: boolean) =>
    db
      .select({
        id: accountEvent.id,
        type: accountEvent.type,
        phone: accountEvent.phone,
        details: accountEvent.details,
        createdAt: accountEvent.createdAt,
        adminName: adminUser.name,
      })
      .from(accountEvent)
      .leftJoin(adminUser, eq(adminUser.id, accountEvent.adminId))
      .where(and(eq(accountEvent.userId, id), onlyAdminActions ? isAdminActionSql() : undefined))
      .orderBy(desc(accountEvent.createdAt), desc(accountEvent.id))
      .limit(DETAIL_EVENTS)
      .then((rows) =>
        rows.map(({ adminName, ...event }) => ({
          ...event,
          account: { name: row.name, email: row.email },
          admin: adminName !== null ? { name: adminName } : null,
        })),
      );

  return {
    ...row,
    lockedUntil: activeLock(row.lockedUntil, now),
    sessions,
    sessionCount,
    events: await events(false),
    adminActions: await events(true),
  };
}

/** El resumen de la tarjeta de Inicio: cuántas cuentas hay, cuántas con WhatsApp y cuántas suspendidas. */
export async function usersSummary(): Promise<{ total: number; withWhatsApp: number; suspended: number }> {
  await requireAdmin();
  const [row] = await db
    .select({ total: count(), withWhatsApp: count(whatsappLink.id), suspended: count(user.suspendedAt) })
    .from(user)
    .leftJoin(whatsappLink, eq(whatsappLink.userId, user.id));
  return row;
}
