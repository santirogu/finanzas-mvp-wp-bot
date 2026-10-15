import "server-only";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { accountEvent, user } from "@/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import { inDayRange, isAdminActionSql } from "../shared/sql";
import {
  ADMIN_ACTIONS_FILTER,
  ADMIN_LOG_TIMEZONE,
  dateRange,
  escapeLike,
  searchDigits,
  type EventType,
  type LogFilters,
} from "./log-filters";

// El historial de /admin/historial: todas las cuentas, de lo más nuevo a lo más viejo. Cada consulta
// valida el rol ella misma (requireAdmin), además de la página que la usa: así no hay forma de
// mostrar estos datos desde una página que lo olvidó. La matriz de autorización lo exige.

export type LogEntry = {
  id: string;
  type: (typeof accountEvent.$inferSelect)["type"];
  phone: string | null;
  details: (typeof accountEvent.$inferSelect)["details"];
  createdAt: Date;
  /** null: intento de vinculación sin cuenta (código inválido) o cuenta que eliminó el admin. */
  account: { name: string; email: string } | null;
  /** El admin que lo hizo (acciones del admin); null si no fue un admin o su cuenta ya no existe. */
  admin: { name: string } | null;
};

export type LogPage = { entries: LogEntry[]; total: number; hasMore: boolean };

// La cuenta del admin que hizo cada acción (la otra unión con user es la cuenta del evento).
const adminUser = alias(user, "admin_user");


function where(filters: LogFilters, today: string): SQL | undefined {
  const conditions: (SQL | undefined)[] = inDayRange(accountEvent.createdAt, dateRange(filters, today));
  if (filters.types.length > 0) {
    const types = filters.types.filter((type): type is EventType => type !== ADMIN_ACTIONS_FILTER);
    conditions.push(
      or(
        types.length > 0 ? inArray(accountEvent.type, types) : undefined,
        filters.types.includes(ADMIN_ACTIONS_FILTER) ? isAdminActionSql() : undefined,
      ),
    );
  }
  if (filters.search) {
    const text = `%${escapeLike(filters.search)}%`;
    const digits = searchDigits(filters.search);
    conditions.push(
      or(
        ilike(user.name, text),
        ilike(user.email, text),
        ilike(accountEvent.phone, text),
        // "+57 300 111" encuentra 573001112233.
        digits.length >= 3 ? ilike(accountEvent.phone, `%${digits}%`) : undefined,
      ),
    );
  }
  return and(...conditions);
}

/**
 * Los primeros `filters.limit` eventos que cumplen los filtros. `today` (YYYY-MM-DD en Colombia) es
 * el día desde el que cuentan "Hoy", "Últimos 7 días"…
 */
export async function listAccountEvents(
  filters: LogFilters,
  today = todayInTimezone(ADMIN_LOG_TIMEZONE),
): Promise<LogPage> {
  await requireAdmin();
  const condition = where(filters, today);
  const [{ total }] = await db
    .select({ total: count() })
    .from(accountEvent)
    .leftJoin(user, eq(user.id, accountEvent.userId))
    .where(condition);

  const rows = await db
    .select({
      id: accountEvent.id,
      type: accountEvent.type,
      phone: accountEvent.phone,
      details: accountEvent.details,
      createdAt: accountEvent.createdAt,
      name: user.name,
      email: user.email,
      adminName: adminUser.name,
    })
    .from(accountEvent)
    .leftJoin(user, eq(user.id, accountEvent.userId))
    .leftJoin(adminUser, eq(adminUser.id, accountEvent.adminId))
    .where(condition)
    .orderBy(desc(accountEvent.createdAt), desc(accountEvent.id))
    .limit(filters.limit);

  return {
    entries: rows.map(({ name, email, adminName, ...event }) => ({
      ...event,
      account: name !== null && email !== null ? { name, email } : null,
      admin: adminName !== null ? { name: adminName } : null,
    })),
    total,
    hasMore: total > rows.length,
  };
}

/** El resumen de la tarjeta de Inicio: cuántos eventos hubo hoy (en Colombia) y cuántos fallaron. */
export async function historySummary(
  today = todayInTimezone(ADMIN_LOG_TIMEZONE),
): Promise<{ today: number; failedToday: number }> {
  await requireAdmin();
  const [row] = await db
    .select({
      today: count(),
      failedToday: sql<number>`count(*) filter (where ${accountEvent.type} = 'whatsapp_link_failed')::int`,
    })
    .from(accountEvent)
    .where(where({ types: [], date: "hoy", from: null, to: null, search: "", limit: 1 }, today));
  return row;
}
