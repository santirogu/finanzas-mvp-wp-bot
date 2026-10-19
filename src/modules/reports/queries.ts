import "server-only";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, transaction } from "@/db/schema";
import { compareMonths, type Month, monthOf, monthRange, shiftMonth } from "@/lib/dates";
import { listActiveMonths } from "@/modules/transactions/queries";
import { BIGGEST_CANDIDATES, biggestExpenses, type ExpenseRow } from "./biggest";
import { AVERAGE_MONTHS, type CategoryMonthTotal, categoryReport } from "./categories";
import type { CsvMovement } from "./csv";
import type { DayDescriptionTotal } from "./daily";
import { getFixedChoices } from "./fixed-choices";
import { type FixedHistoryEntry, fixedHistories } from "./history";
import { getExpenseHistoryMonths, getFixedNotes, noteKey } from "./history-notes";
import type { ReportPeriod } from "./period";
import { type DescriptionMonthTotal, recurringExpenses, recurringFrom } from "./recurring";
import { monthSeries, type MonthTotals, periodSummary } from "./summary";

// Las consultas de Reportes. Reciben el userId ya validado por el Data Access Layer
// (src/lib/session.ts) y siempre filtran por él. Agrupan por mes en la base; lo demás (promedios,
// gastos fijos) lo calculan funciones puras, con sus pruebas unitarias.

/** Del primer día de `first` al primer día del mes siguiente a `last` (exclusivo). */
const between = (first: Month, last: Month) => ({
  start: monthRange(first.year, first.month).start,
  end: monthRange(last.year, last.month).end,
});

const activeBetween = (userId: string, first: Month, last: Month) => {
  const { start, end } = between(first, last);
  return and(
    eq(transaction.userId, userId),
    isNull(transaction.deletedAt),
    gte(transaction.occurredOn, start),
    lt(transaction.occurredOn, end),
  );
};

const monthOfTransaction = sql<string>`to_char(${transaction.occurredOn}, 'YYYY-MM')`;

/** Los ingresos y egresos de cada mes con movimientos, de `first` a `last`. */
export async function getMonthlyTotals(userId: string, first: Month, last: Month): Promise<MonthTotals[]> {
  const rows = await db
    .select({
      month: monthOfTransaction,
      income: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.type} = 'income'), 0)`,
      expense: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.type} = 'expense'), 0)`,
    })
    .from(transaction)
    .where(activeBetween(userId, first, last))
    .groupBy(monthOfTransaction);
  return rows.map((row) => ({ month: row.month, income: Number(row.income), expense: Number(row.expense) }));
}

/** Los egresos de cada categoría en cada mes, de `first` a `last`. */
export async function getCategoryMonthlyTotals(userId: string, first: Month, last: Month): Promise<CategoryMonthTotal[]> {
  const rows = await db
    .select({
      month: monthOfTransaction,
      name: sql<string>`coalesce(${category.name}, 'Sin categoría')`,
      emoji: sql<string>`coalesce(${category.emoji}, '•')`,
      total: sql<string>`sum(${transaction.amount})`,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(activeBetween(userId, first, last), eq(transaction.type, "expense")))
    .groupBy(monthOfTransaction, category.name, category.emoji);
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/**
 * Los egresos de cada mes agrupados por descripción (sin importar mayúsculas ni espacios en los
 * extremos; las tildes se juntan después, en recurringExpenses), de `first` a `last`.
 */
export async function getExpenseDescriptionsByMonth(userId: string, first: Month, last: Month): Promise<DescriptionMonthTotal[]> {
  const latest = sql`${transaction.occurredOn} desc, ${transaction.createdAt} desc`;
  const rows = await db
    .select({
      month: monthOfTransaction,
      description: sql<string>`(array_agg(trim(${transaction.description}) order by ${latest}))[1]`,
      emoji: sql<string>`(array_agg(coalesce(${category.emoji}, '•') order by ${latest}))[1]`,
      count: sql<number>`count(*)::int`,
      total: sql<string>`sum(${transaction.amount})`,
      latest: sql<string>`max(${transaction.occurredOn})::text`,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(activeBetween(userId, first, last), eq(transaction.type, "expense")))
    .groupBy(monthOfTransaction, sql`lower(trim(${transaction.description}))`);
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/** Los egresos más altos de `first` a `last` (hasta BIGGEST_CANDIDATES); si empatan, el más reciente primero. */
export async function getLargestExpenses(userId: string, first: Month, last: Month): Promise<ExpenseRow[]> {
  return db
    .select({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      occurredOn: transaction.occurredOn,
      categoryName: category.name,
      categoryEmoji: category.emoji,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(activeBetween(userId, first, last), eq(transaction.type, "expense")))
    .orderBy(desc(transaction.amount), desc(transaction.occurredOn), desc(transaction.createdAt))
    .limit(BIGGEST_CANDIDATES);
}

/**
 * Los egresos de cada día de `first` a `last`, agrupados por descripción (sin importar mayúsculas ni
 * espacios en los extremos; las tildes se juntan después, al quitar los gastos fijos).
 */
export async function getExpensesByDay(userId: string, first: Month, last: Month): Promise<DayDescriptionTotal[]> {
  const rows = await db
    .select({
      day: sql<string>`${transaction.occurredOn}::text`,
      description: sql<string>`min(trim(${transaction.description}))`,
      total: sql<string>`sum(${transaction.amount})`,
      count: sql<number>`count(*)::int`,
    })
    .from(transaction)
    .where(and(activeBetween(userId, first, last), eq(transaction.type, "expense")))
    .groupBy(transaction.occurredOn, sql`lower(trim(${transaction.description}))`);
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/** Los egresos de un mes, por día y, en el mismo día, del más alto al más bajo: el detalle del calendario. */
export async function getMonthExpenses(userId: string, month: Month): Promise<ExpenseRow[]> {
  return db
    .select({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      occurredOn: transaction.occurredOn,
      categoryName: category.name,
      categoryEmoji: category.emoji,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(activeBetween(userId, month, month), eq(transaction.type, "expense")))
    .orderBy(asc(transaction.occurredOn), desc(transaction.amount), asc(transaction.createdAt));
}

/** Los movimientos de `first` a `last`, del más antiguo al más reciente: los del CSV de Reportes. */
export async function listPeriodMovements(userId: string, first: Month, last: Month): Promise<CsvMovement[]> {
  return db
    .select({
      occurredOn: transaction.occurredOn,
      type: transaction.type,
      description: transaction.description,
      categoryName: category.name,
      amount: transaction.amount,
      source: transaction.source,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(activeBetween(userId, first, last))
    .orderBy(asc(transaction.occurredOn), asc(transaction.createdAt));
}

/** Todo lo que muestra Reportes en un período (`current` es el mes en curso, en la zona de la persona). */
export async function getReport(userId: string, period: ReportPeriod, current: Month) {
  const first = period.months[0];
  const last = period.months[period.months.length - 1];
  // Las categorías se comparan con los meses anteriores (pueden quedar fuera del período) y los gastos
  // fijos se buscan en los últimos meses (en un año que recién empieza, también los del anterior).
  const categoriesFrom = shiftMonth(last, -(AVERAGE_MONTHS + 1));
  const [activeMonths, monthly, categories, descriptions, largest, choices, historyMonths, notes] = await Promise.all([
    listActiveMonths(userId),
    getMonthlyTotals(userId, first, last),
    getCategoryMonthlyTotals(userId, compareMonths(categoriesFrom, first) < 0 ? categoriesFrom : first, last),
    getExpenseDescriptionsByMonth(userId, recurringFrom(period.months), last),
    getLargestExpenses(userId, first, last),
    getFixedChoices(userId),
    getExpenseHistoryMonths(userId),
    getFixedNotes(userId),
  ]);
  // Los gastos fijos, con lo que la persona agregó o quitó a mano.
  const recurring = recurringExpenses(descriptions, period.months, choices);
  // El historial del valor de cada uno (de todo el tiempo, no solo del período), con sus notas.
  const byKey = fixedHistories(historyMonths, recurring.items.map((item) => item.key));
  const histories: Record<string, FixedHistoryEntry[]> = {};
  for (const [key, entries] of byKey) {
    histories[key] = entries.map((entry) => ({ ...entry, note: notes.get(noteKey(key, entry.month)) ?? null }));
  }
  const series = monthSeries(period.months, monthly);
  // listActiveMonths va del más reciente al más antiguo.
  const firstActive = activeMonths.length > 0 ? monthOf(`${activeMonths[activeMonths.length - 1]}-01`) : null;
  return {
    activeMonths,
    series,
    summary: periodSummary(series, current, firstActive),
    categories: categoryReport(categories, period.months, current, new Set(activeMonths)),
    recurring,
    histories,
    biggest: biggestExpenses(largest, recurring.items),
  };
}

export type Report = Awaited<ReturnType<typeof getReport>>;
