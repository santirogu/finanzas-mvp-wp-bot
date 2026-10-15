import "server-only";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { accountEvent, user } from "@/db/schema";
import {
  ADMIN_LOG_PAGE_SIZE,
  ADMIN_LOG_TIMEZONE,
  escapeLike,
  searchDigits,
  type LogFilters,
} from "./log-filters";

// La lista de eventos de /admin: todas las cuentas, de lo más nuevo a lo más viejo. Solo se usa
// detrás de requireAdmin (la matriz de autorización lo exige).

export type LogEntry = {
  id: string;
  type: (typeof accountEvent.$inferSelect)["type"];
  phone: string | null;
  details: (typeof accountEvent.$inferSelect)["details"];
  createdAt: Date;
  /** null: intento de vinculación sin cuenta (código inválido). */
  account: { name: string; email: string } | null;
};

export type LogPage = { entries: LogEntry[]; total: number; page: number; pageCount: number };

/** Medianoche de ese día en Colombia, como instante (para comparar con created_at sin perder el índice). */
const startOfDay = (day: string) => sql`(${day}::date)::timestamp at time zone ${ADMIN_LOG_TIMEZONE}`;

function where(filters: LogFilters): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  if (filters.type) conditions.push(eq(accountEvent.type, filters.type));
  if (filters.from) conditions.push(sql`${accountEvent.createdAt} >= ${startOfDay(filters.from)}`);
  if (filters.to) conditions.push(sql`${accountEvent.createdAt} < ${startOfDay(filters.to)} + interval '1 day'`);
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

export async function listAccountEvents(filters: LogFilters): Promise<LogPage> {
  const condition = where(filters);
  const [{ total }] = await db
    .select({ total: count() })
    .from(accountEvent)
    .leftJoin(user, eq(user.id, accountEvent.userId))
    .where(condition);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_LOG_PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);

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
    .limit(ADMIN_LOG_PAGE_SIZE)
    .offset((page - 1) * ADMIN_LOG_PAGE_SIZE);

  return {
    entries: rows.map(({ name, email, ...event }) => ({
      ...event,
      account: name !== null && email !== null ? { name, email } : null,
    })),
    total,
    page,
    pageCount,
  };
}
