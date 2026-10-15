import "server-only";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { accountEvent, user } from "@/db/schema";
import { todayInTimezone } from "@/lib/dates";
import { ADMIN_LOG_TIMEZONE, dateRange, escapeLike, searchDigits, type LogFilters } from "./log-filters";

// El historial de /admin: todas las cuentas, de lo más nuevo a lo más viejo. Solo se usa detrás de
// requireAdmin (la matriz de autorización lo exige).

export type LogEntry = {
  id: string;
  type: (typeof accountEvent.$inferSelect)["type"];
  phone: string | null;
  details: (typeof accountEvent.$inferSelect)["details"];
  createdAt: Date;
  /** null: intento de vinculación sin cuenta (código inválido). */
  account: { name: string; email: string } | null;
};

export type LogPage = { entries: LogEntry[]; total: number; hasMore: boolean };

/** Medianoche de ese día en Colombia, como instante (para comparar con created_at sin perder el índice). */
const startOfDay = (day: string) => sql`(${day}::date)::timestamp at time zone ${ADMIN_LOG_TIMEZONE}`;

function where(filters: LogFilters, today: string): SQL | undefined {
  const { from, to } = dateRange(filters, today);
  const conditions: (SQL | undefined)[] = [];
  if (filters.types.length > 0) conditions.push(inArray(accountEvent.type, filters.types));
  if (from) conditions.push(sql`${accountEvent.createdAt} >= ${startOfDay(from)}`);
  if (to) conditions.push(sql`${accountEvent.createdAt} < ${startOfDay(to)} + interval '1 day'`);
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
    })
    .from(accountEvent)
    .leftJoin(user, eq(user.id, accountEvent.userId))
    .where(condition)
    .orderBy(desc(accountEvent.createdAt), desc(accountEvent.id))
    .limit(filters.limit);

  return {
    entries: rows.map(({ name, email, ...event }) => ({
      ...event,
      account: name !== null && email !== null ? { name, email } : null,
    })),
    total,
    hasMore: total > rows.length,
  };
}
