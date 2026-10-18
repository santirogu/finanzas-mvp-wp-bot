import "server-only";
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, transaction, type TransactionType } from "@/db/schema";
import type { MonthRange } from "@/lib/dates";
import { roundToCents } from "@/lib/money";
import { sortCategories } from "./default-categories";

// Todas las consultas reciben el userId ya validado por el Data Access Layer
// (src/lib/session.ts) y siempre filtran por él.

const activeInMonth = (userId: string, range: MonthRange) =>
  and(
    eq(transaction.userId, userId),
    isNull(transaction.deletedAt),
    gte(transaction.occurredOn, range.start),
    lt(transaction.occurredOn, range.end),
  );

export async function getMonthlySummary(userId: string, range: MonthRange) {
  const [row] = await db
    .select({
      income: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.type} = 'income'), 0)`,
      expense: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.type} = 'expense'), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transaction)
    .where(activeInMonth(userId, range));

  // La base suma exacto (numeric); la resta se redondea a centavos para no dejar restos de float.
  const income = Number(row.income);
  const expense = Number(row.expense);
  return { income, expense, balance: roundToCents(income - expense), count: row.count };
}

export async function getTotalsByCategory(userId: string, type: TransactionType, range: MonthRange) {
  const rows = await db
    .select({
      name: sql<string>`coalesce(${category.name}, 'Sin categoría')`,
      emoji: sql<string>`coalesce(${category.emoji}, '•')`,
      total: sql<string>`sum(${transaction.amount})`,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(activeInMonth(userId, range), eq(transaction.type, type)))
    .groupBy(category.name, category.emoji)
    .orderBy(desc(sql`sum(${transaction.amount})`));

  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

export async function listTransactions(
  userId: string,
  range: MonthRange,
  options: { type?: TransactionType; limit?: number } = {},
) {
  return db
    .select({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description,
      occurredOn: transaction.occurredOn,
      source: transaction.source,
      categoryName: category.name,
      categoryEmoji: category.emoji,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(
      and(
        activeInMonth(userId, range),
        options.type ? eq(transaction.type, options.type) : undefined,
      ),
    )
    .orderBy(desc(transaction.occurredOn), desc(transaction.createdAt))
    .limit(options.limit ?? 500);
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number];

/**
 * Cuántas descripciones distintas le llegan al formulario para sugerir (la lista muestra hasta 6 de
 * las que coinciden con lo escrito; la búsqueda es en el navegador). Con 20 se perdían las que se usan
 * cada tanto: con 36 egresos en un mes, una poco usada quedaba por fuera aunque se escribiera exacta.
 */
export const DESCRIPTION_SUGGESTIONS = 300;

/**
 * Las descripciones que el usuario ya usó en movimientos de ese tipo desde `since` (YYYY-MM-DD), para
 * sugerirlas al escribir: las más usadas primero (y, a igual uso, la más reciente). "Mercado" y
 * "mercado " cuentan como una sola, escrita como la última vez. Cada una trae la categoría de su
 * último movimiento (o null), para proponerla.
 */
export async function listDescriptionSuggestions(userId: string, type: TransactionType, since: string) {
  const key = sql`lower(trim(${transaction.description}))`;
  const latest = sql`${transaction.occurredOn} desc, ${transaction.createdAt} desc`;
  return db
    .select({
      description: sql<string>`(array_agg(trim(${transaction.description}) order by ${latest}))[1]`,
      categoryId: sql<string | null>`(array_agg(${transaction.categoryId} order by ${latest}))[1]`,
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, type),
        isNull(transaction.deletedAt),
        gte(transaction.occurredOn, since),
      ),
    )
    .groupBy(key)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${transaction.occurredOn})`), key)
    .limit(DESCRIPTION_SUGGESTIONS);
}

/** Los meses ("YYYY-MM") en que el usuario tiene movimientos, del más reciente al más antiguo. */
export async function listActiveMonths(userId: string) {
  const month = sql<string>`to_char(${transaction.occurredOn}, 'YYYY-MM')`;
  const rows = await db
    .select({ month })
    .from(transaction)
    .where(and(eq(transaction.userId, userId), isNull(transaction.deletedAt)))
    .groupBy(month)
    .orderBy(desc(month));
  return rows.map((r) => r.month);
}

/** Un movimiento propio y no eliminado, para editarlo; null si no existe o es de otro usuario. */
export async function getTransaction(userId: string, id: string) {
  const [row] = await db
    .select({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      categoryId: transaction.categoryId,
      occurredOn: transaction.occurredOn,
      source: transaction.source,
    })
    .from(transaction)
    .where(and(eq(transaction.id, id), eq(transaction.userId, userId), isNull(transaction.deletedAt)));
  return row ?? null;
}

export type EditableTransaction = NonNullable<Awaited<ReturnType<typeof getTransaction>>>;

/**
 * Cuánto tiempo después de borrar un movimiento se puede deshacer desde la web (el aviso
 * "Se borró… · Deshacer" de Ingresos y Egresos). Después queda borrado, hasta que la limpieza diaria
 * lo elimine del todo (retention.ts).
 */
export const UNDO_WINDOW_MS = 10 * 60_000;

/** El primer momento en que un movimiento borrado todavía se puede restaurar. */
export const undoableSince = (now: Date) => new Date(now.getTime() - UNDO_WINDOW_MS);

/**
 * Lo que dice el aviso después de borrar o de deshacer: un movimiento propio, borrado hace menos de
 * UNDO_WINDOW_MS ("deleted") o vuelto a la lista ("restored"). null si no hay nada que avisar.
 */
export async function getTransactionNotice(userId: string, id: string, kind: "deleted" | "restored", now = new Date()) {
  const [row] = await db
    .select({ id: transaction.id, description: transaction.description })
    .from(transaction)
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.userId, userId),
        kind === "deleted" ? gte(transaction.deletedAt, undoableSince(now)) : isNull(transaction.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Las categorías que puede elegir el usuario (las globales y las suyas), sin las archivadas: las de
 * los formularios y las que conoce el bot. Alfabéticas, con "Otros" al final.
 */
export async function listCategories(userId: string, type: TransactionType) {
  const rows = await db
    .select({ id: category.id, name: category.name, emoji: category.emoji })
    .from(category)
    .where(
      and(
        eq(category.type, type),
        or(isNull(category.userId), eq(category.userId, userId)),
        isNull(category.archivedAt),
      ),
    );
  return sortCategories(rows);
}

/**
 * La categoría de un movimiento, aunque esté archivada: para que al editarlo no se pierda sin querer.
 * null si no tiene o no es una que pueda ver el usuario.
 */
export async function getCategoryOption(userId: string, categoryId: string | null) {
  if (!categoryId) return null;
  const [row] = await db
    .select({ id: category.id, name: category.name, emoji: category.emoji, archivedAt: category.archivedAt })
    .from(category)
    .where(and(eq(category.id, categoryId), or(isNull(category.userId), eq(category.userId, userId))));
  return row ? { id: row.id, name: row.name, emoji: row.emoji, archived: row.archivedAt !== null } : null;
}

/**
 * ¿Puede usar esa categoría? Tiene que ser de su tipo, global o suya, y no estar archivada; al
 * editar un movimiento (`keepFrom`), también vale la archivada que ya tenía.
 */
export async function isCategoryAvailable(
  userId: string,
  categoryId: string,
  type: TransactionType,
  { keepFrom }: { keepFrom?: string } = {},
) {
  // La categoría que ya tiene ese movimiento (propio). Va en una consulta aparte: en una subconsulta,
  // Drizzle escribe las columnas sin su tabla y se confundirían.
  const [kept] = keepFrom
    ? await db
        .select({ categoryId: transaction.categoryId })
        .from(transaction)
        .where(and(eq(transaction.id, keepFrom), eq(transaction.userId, userId)))
    : [];
  const alreadyThere = kept?.categoryId ? eq(category.id, kept.categoryId) : undefined;
  const [row] = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.id, categoryId),
        eq(category.type, type),
        or(isNull(category.userId), eq(category.userId, userId)),
        or(isNull(category.archivedAt), alreadyThere),
      ),
    )
    .limit(1);
  return Boolean(row);
}
