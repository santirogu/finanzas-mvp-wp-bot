import "server-only";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { category, transaction } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { compareMonths, type Month, monthOf, monthParam, monthRange, shiftMonth } from "@/lib/dates";
import { sumAmounts } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";
import { getAppValues } from "@/modules/app-values/current";
import { recurringRuleOf } from "@/modules/app-values/values";
import { listActiveMonths } from "@/modules/transactions/queries";
import { categoryNameIn } from "@/modules/transactions/category-name";
import { NO_CATEGORIES } from "@/modules/transactions/search";
import { BIGGEST_CANDIDATES, biggestExpenses, type ExpenseRow } from "./biggest";
import { AVERAGE_MONTHS, type CategoryMonthTotal, categoryReport } from "./categories";
import type { CsvMovement } from "./csv";
import type { DayDescriptionTotal } from "./daily";
import { getFixedChoices } from "./fixed-choices";
import { getLastPayments } from "./fixed-payments";
import { type CategoryToDate, type MonthFact, monthFact } from "./month-fact";
import { type FixedHistoryEntry, fixedHistories } from "./history";
import { getExpenseHistoryMonths, getFixedNotes, noteKey } from "./history-notes";
import { getPaymentSkips } from "./payment-skips";
import { type ReportPeriod, reportPeriod } from "./period";
import { type FixedMonth, fixedMonth } from "./fixed-month";
import { type MonthFixed, monthFixed } from "./remaining";
import { type DescriptionMonthTotal, recurringExpenses, recurringFrom } from "./recurring";
import { monthSeries, type MonthTotals, periodSummary } from "./summary";
import { type UpcomingPayment, upcomingPayments } from "./upcoming";
import { getUpcomingSettings } from "./upcoming-settings";

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

/**
 * Los egresos de cada categoría en cada mes, de `first` a `last`, con su nombre en el idioma de la página;
 * los sin categoría, juntos ("Sin categoría").
 */
export async function getCategoryMonthlyTotals(userId: string, first: Month, last: Month, locale: Locale = DEFAULT_LOCALE): Promise<CategoryMonthTotal[]> {
  const rows = await db
    .select({
      month: monthOfTransaction,
      name: sql<string>`coalesce(${categoryNameIn(locale)}, ${NO_CATEGORIES[locale]})`,
      emoji: sql<string>`coalesce(${category.emoji}, '•')`,
      total: sql<string>`sum(${transaction.amount})`,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(activeBetween(userId, first, last), eq(transaction.type, "expense")))
    .groupBy(monthOfTransaction, category.name, category.nameEn, category.emoji);
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
export async function getLargestExpenses(userId: string, first: Month, last: Month, locale: Locale = DEFAULT_LOCALE): Promise<ExpenseRow[]> {
  return db
    .select({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      occurredOn: transaction.occurredOn,
      categoryName: categoryNameIn(locale),
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
export async function getMonthExpenses(userId: string, month: Month, locale: Locale = DEFAULT_LOCALE): Promise<ExpenseRow[]> {
  return db
    .select({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      occurredOn: transaction.occurredOn,
      categoryName: categoryNameIn(locale),
      categoryEmoji: category.emoji,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(activeBetween(userId, month, month), eq(transaction.type, "expense")))
    .orderBy(asc(transaction.occurredOn), desc(transaction.amount), asc(transaction.createdAt));
}

/** Los movimientos de `first` a `last`, del más antiguo al más reciente: los del CSV de Reportes (en su idioma). */
export async function listPeriodMovements(userId: string, first: Month, last: Month, locale: Locale = DEFAULT_LOCALE): Promise<CsvMovement[]> {
  return db
    .select({
      occurredOn: transaction.occurredOn,
      type: transaction.type,
      description: transaction.description,
      categoryName: categoryNameIn(locale),
      amount: transaction.amount,
      source: transaction.source,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(activeBetween(userId, first, last))
    .orderBy(asc(transaction.occurredOn), asc(transaction.createdAt));
}

/**
 * Todo lo que muestra Reportes en un período (`current` es el mes en curso, en la zona de la persona), con
 * los textos en el idioma de la página (`locale`).
 */
export async function getReport(userId: string, period: ReportPeriod, current: Month, locale: Locale = DEFAULT_LOCALE) {
  const first = period.months[0];
  const last = period.months[period.months.length - 1];
  // Las categorías se comparan con los meses anteriores (pueden quedar fuera del período) y los gastos
  // fijos se buscan en los últimos meses (en un año que recién empieza, también los del anterior).
  const categoriesFrom = shiftMonth(last, -(AVERAGE_MONTHS + 1));
  // Cuándo un gasto es fijo (Valores de la app): decide desde qué mes se consulta.
  const rule = recurringRuleOf(await getAppValues());
  const [activeMonths, monthly, categories, descriptions, largest, choices] = await Promise.all([
    listActiveMonths(userId),
    getMonthlyTotals(userId, first, last),
    getCategoryMonthlyTotals(userId, compareMonths(categoriesFrom, first) < 0 ? categoriesFrom : first, last, locale),
    getExpenseDescriptionsByMonth(userId, recurringFrom(period.months, rule.window), last),
    getLargestExpenses(userId, first, last, locale),
    getFixedChoices(userId),
  ]);
  // Los gastos fijos (con lo que la persona agregó o quitó a mano) no se muestran en Reportes (tienen su
  // pestaña, /gastos-fijos), pero salen de los gastos más grandes y del gasto por día.
  const recurring = recurringExpenses(descriptions, period.months, choices, rule);
  const series = monthSeries(period.months, monthly);
  return {
    activeMonths,
    series,
    summary: periodSummary(series, current, firstActiveOf(activeMonths)),
    categories: categoryReport(categories, period.months, current, new Set(activeMonths), locale),
    recurring,
    biggest: biggestExpenses(largest, recurring.items),
  };
}

/** El primer mes con movimientos; null si no hay. `activeMonths` va del más reciente al más antiguo. */
const firstActiveOf = (activeMonths: string[]) => (activeMonths.length > 0 ? monthOf(`${activeMonths[activeMonths.length - 1]}-01`) : null);

/**
 * Lo que muestra "Gastos fijos" (/gastos-fijos) en un período: los gastos fijos (con lo que la persona
 * agregó o quitó a mano), el historial del valor de cada uno (de todo el tiempo, no solo del período) con
 * sus notas, y el gasto promedio por mes (para decir qué parte son).
 */
export async function getFixedExpenses(userId: string, period: ReportPeriod, current: Month) {
  const first = period.months[0];
  const last = period.months[period.months.length - 1];
  const rule = recurringRuleOf(await getAppValues());
  const [activeMonths, monthly, descriptions, choices, historyMonths, notes] = await Promise.all([
    listActiveMonths(userId),
    getMonthlyTotals(userId, first, last),
    getExpenseDescriptionsByMonth(userId, recurringFrom(period.months, rule.window), last),
    getFixedChoices(userId),
    getExpenseHistoryMonths(userId),
    getFixedNotes(userId),
  ]);
  const recurring = recurringExpenses(descriptions, period.months, choices, rule);
  const byKey = fixedHistories(historyMonths, recurring.items.map((item) => item.key));
  // Con fromEntries: la clave de un gasto como "__proto__" queda como una más (asignada, cambiaría el prototipo).
  const histories: Record<string, FixedHistoryEntry[]> = Object.fromEntries(
    [...byKey].map(([key, entries]) => [key, entries.map((entry) => ({ ...entry, note: notes.get(noteKey(key, entry.month)) ?? null }))]),
  );
  const { averageExpense } = periodSummary(monthSeries(period.months, monthly), current, firstActiveOf(activeMonths));
  return { recurring, histories, averageExpense };
}

export type FixedExpensesReport = Awaited<ReturnType<typeof getFixedExpenses>>;

export type Report = Awaited<ReturnType<typeof getReport>>;

/**
 * Los avisos de próximos pagos del Resumen: los gastos fijos de los últimos 12 meses (con lo que la
 * persona marcó a mano) cuyo pago toca en los días de anticipación que eligió (`days`) o está atrasado,
 * sin los que marcó "ya no aplica", con la categoría de su último pago. Con los avisos apagados, ninguno. `current` y `today` (YYYY-MM-DD),
 * en la zona de la persona.
 */
export async function getUpcomingPayments(
  userId: string,
  current: Month,
  today: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<{ enabled: boolean; days: number; payments: (UpcomingPayment & { category: string | null })[] }> {
  const settings = await getUpcomingSettings(userId);
  if (!settings.enabled) return { ...settings, payments: [] };
  const [{ items, history, skipped }, lastPayments] = await Promise.all([
    getFixedPaymentsData(userId, monthParam(current)),
    getLastPayments(userId, locale),
  ]);
  // Con la categoría del último pago: la que lleva "Registrar pago" (null, sin categoría: el aviso lo dice
  // en el idioma de la página).
  const payments = upcomingPayments(items, history, skipped, today, settings.days).map((payment) => ({
    ...payment,
    category: lastPayments.get(payment.key)?.category ?? null,
  }));
  return { ...settings, payments };
}

/**
 * Lo que miran los avisos de próximos pagos y "Lo que te queda": los gastos fijos (con lo del último mes), los
 * egresos por mes y descripción y los pagos marcados "ya no aplica". Con `cache`: en el Resumen lo piden la página y
 * la campana en el mismo request (`month`: el mes en curso, "YYYY-MM").
 */
const getFixedPaymentsData = cache(async (userId: string, month: string) => {
  const period = reportPeriod(undefined, monthOf(`${month}-01`));
  const rule = recurringRuleOf(await getAppValues());
  const [descriptions, choices, history, skipped] = await Promise.all([
    getExpenseDescriptionsByMonth(userId, recurringFrom(period.months, rule.window), period.months[period.months.length - 1]),
    getFixedChoices(userId),
    getExpenseHistoryMonths(userId),
    getPaymentSkips(userId),
  ]);
  return { items: recurringExpenses(descriptions, period.months, choices, rule).items, history, skipped };
});

/**
 * Los gastos fijos del mes en curso para "Lo que te queda" (Resumen): lo que falta pagar y lo que ya se pagó. No
 * depende de los avisos: cuenta aunque la persona los haya apagado.
 */
export async function getMonthFixed(userId: string, current: Month, today: string): Promise<MonthFixed> {
  const { items, history, skipped } = await getFixedPaymentsData(userId, monthParam(current));
  return monthFixed(items, history, skipped, today);
}

/**
 * El estado del mes en curso de cada gasto fijo, para Fijos: pagado, falta (o atrasado) o "ya no aplica", y cuántos
 * se pagaron. `today` (YYYY-MM-DD), en la zona de la persona.
 */
export async function getFixedMonth(userId: string, current: Month, today: string): Promise<FixedMonth> {
  const { items, history, skipped } = await getFixedPaymentsData(userId, monthParam(current));
  return fixedMonth(items, history, skipped, today);
}

/**
 * Los egresos de cada mes del 1 al día `day`, por categoría y descripción (sin mayúsculas ni espacios en los
 * extremos), de `first` a `last`: lo que compara el dato del mes, que después descarta los gastos fijos.
 */
async function getCategoryDescriptionsToDate(userId: string, first: Month, last: Month, day: number, locale: Locale) {
  const description = sql<string>`lower(trim(${transaction.description}))`;
  const rows = await db
    .select({
      month: monthOfTransaction,
      name: sql<string>`coalesce(${categoryNameIn(locale)}, ${NO_CATEGORIES[locale]})`,
      emoji: sql<string>`coalesce(${category.emoji}, '•')`,
      description,
      total: sql<string>`sum(${transaction.amount})`,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(activeBetween(userId, first, last), eq(transaction.type, "expense"), sql`extract(day from ${transaction.occurredOn}) <= ${day}`))
    .groupBy(monthOfTransaction, category.name, category.nameEn, category.emoji, description);
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/**
 * El dato del mes del Resumen (src/modules/reports/month-fact.ts): el mes en curso hasta hoy (`today`, YYYY-MM-DD
 * en la zona de la persona) frente a los mismos días de los AVERAGE_MONTHS anteriores en que tuvo movimientos, sin
 * los gastos fijos (con lo que marcó a mano). null si no hay con qué comparar o nada se salió de lo normal.
 */
export async function getMonthFact(userId: string, current: Month, today: string, locale: Locale = DEFAULT_LOCALE): Promise<MonthFact | null> {
  const active = new Set(await listActiveMonths(userId));
  const averaged = Array.from({ length: AVERAGE_MONTHS }, (_, i) => shiftMonth(current, i - AVERAGE_MONTHS)).filter((month) => active.has(monthParam(month)));
  if (averaged.length === 0) return null;
  const [rows, fixed] = await Promise.all([
    getCategoryDescriptionsToDate(userId, averaged[0], current, Number(today.slice(8, 10)), locale),
    getFixedPaymentsData(userId, monthParam(current)),
  ]);
  const fixedKeys = new Set(fixed.items.map((item) => item.key));
  const totals = new Map<string, CategoryToDate>();
  for (const row of rows) {
    if (fixedKeys.has(searchKey(row.description))) continue;
    const key = `${row.month} ${row.emoji} ${row.name}`;
    const seen = totals.get(key);
    totals.set(key, { month: row.month, name: row.name, emoji: row.emoji, total: sumAmounts([seen?.total ?? 0, row.total]) });
  }
  return monthFact([...totals.values()], current, averaged);
}
