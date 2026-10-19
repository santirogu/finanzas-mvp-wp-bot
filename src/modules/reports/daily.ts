import { compareMonths, formatShortDate, type Month, monthParam, monthRange, parseMonthParam } from "@/lib/dates";
import { roundToCents, sumAmounts } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";
import type { ExpenseRow } from "./biggest";
import { LAST_12_MONTHS, type ReportPeriod } from "./period";

// "¿Qué días gastas más?" de Reportes: lo que se gastó cada día del período, sin los gastos fijos (si
// no, el día del arriendo opaca todo lo demás), en un calendario de un mes (`?calendario=`), el promedio
// por día de la semana y cuánto cae en cada quincena.

/** Lo que sumó una descripción en un día (YYYY-MM-DD), como lo da la base. */
export type DayDescriptionTotal = { day: string; description: string; total: number; count: number };

export type DayTotal = { total: number; count: number };

/** Lo de cada día (YYYY-MM-DD), sin los egresos con la descripción de un gasto fijo (como los detecta recurringExpenses). */
export function dayTotals(rows: DayDescriptionTotal[], fixed: { description: string }[]): Map<string, DayTotal> {
  const fixedKeys = new Set(fixed.map((item) => searchKey(item.description)));
  const days = new Map<string, DayTotal>();
  for (const row of rows) {
    if (fixedKeys.has(searchKey(row.description))) continue;
    const seen = days.get(row.day);
    days.set(row.day, { total: sumAmounts([seen?.total ?? 0, row.total]), count: (seen?.count ?? 0) + row.count });
  }
  return days;
}

/** El tono de un día: 0 sin gastos; de 1 a 4, según su puesto entre los días con gastos del período. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * El tono de cada total, por su puesto entre todos los días con gastos del período (no frente al más
 * alto: una compra grande dejaría todos los demás días en el tono más claro). El cuarto de los días que
 * más gastaron va en el más oscuro; si todos gastaron lo mismo, todos.
 */
export function heatLevels(totals: number[]): (total: number) => HeatLevel {
  const spent = totals.filter((total) => total > 0);
  return (total) => {
    if (total <= 0) return 0;
    // Uno que no está entre los días (no debería pasar): el más oscuro, como si fuera el único.
    if (spent.length === 0) return 4;
    // Cuántos días gastaron lo mismo o menos (los empates van juntos).
    const atMost = spent.filter((other) => other <= total).length;
    return Math.max(1, Math.ceil((4 * atMost) / spent.length)) as HeatLevel;
  };
}

/** "YYYY-MM-DD" → 0 (lunes) a 6 (domingo): la semana empieza el lunes, como en Colombia. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** El día siguiente (YYYY-MM-DD). */
function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * El promedio de cada día de la semana (de lunes a domingo) de `from` a `to` (los dos incluidos),
 * contando también los días sin gastos: si no, un solo sábado con una compra grande parecería la norma.
 */
export function weekdayAverages(days: Map<string, DayTotal>, from: string, to: string): number[] {
  // Lo de cada fecha del rango (0 si no hubo gastos), separado por día de la semana.
  const byWeekday = Array.from({ length: 7 }, () => [] as number[]);
  for (let date = from; date <= to; date = nextDay(date)) byWeekday[weekdayOf(date)].push(days.get(date)?.total ?? 0);
  // Stryker disable next-line ConditionalExpression: sin días, 0/0 da NaN y roundToCents lo vuelve 0 (el resultado es el mismo)
  return byWeekday.map((values) => (values.length === 0 ? 0 : roundToCents(sumAmounts(values) / values.length)));
}

/**
 * El día de la semana de más gasto y cuánto más que el promedio de los otros seis (en porcentaje,
 * redondeado; null si los otros no gastaron nada). Null si no hubo gastos.
 */
export function weekdayInsight(averages: number[]): { weekday: number; pct: number | null } | null {
  const max = Math.max(...averages);
  if (max <= 0) return null;
  const weekday = averages.indexOf(max);
  const others = sumAmounts(averages.filter((_, i) => i !== weekday)) / (averages.length - 1);
  return { weekday, pct: others > 0 ? Math.round((max / others - 1) * 100) : null };
}

/** El último día de un mes (YYYY-MM-DD; siempre de dos cifras: del 28 al 31). */
const lastDayOf = (month: Month) => `${monthParam(month)}-${new Date(Date.UTC(month.year, month.month, 0)).getUTCDate()}`;

/**
 * Los días que cuenta el promedio por día de la semana: desde el comienzo del período (o del primer mes
 * con movimientos, `firstActive` "YYYY-MM", si es después: antes la persona no usaba la app) hasta hoy
 * (o el fin del período, si ya pasó).
 */
export function averagedRange(months: Month[], firstActive: string | null, today: string): { from: string; to: string } {
  const start = monthRange(months[0].year, months[0].month).start;
  const end = lastDayOf(months[months.length - 1]);
  // Stryker disable next-line EqualityOperator: si son el mismo día, da lo mismo cuál se toma
  const from = firstActive && `${firstActive}-01` > start ? `${firstActive}-01` : start;
  // Stryker disable next-line EqualityOperator: ídem
  return { from, to: today < end ? today : end };
}

/** La frase del día de la semana de más gasto ("Gastas más los sábados: 85% más que …"); null sin gastos. */
export function insightPhrase(insight: ReturnType<typeof weekdayInsight>): string | null {
  if (!insight) return null;
  const days = weekdayPlural(insight.weekday);
  if (insight.pct === null) return `Gastas más ${days}.`;
  if (insight.pct === 0) return "Gastas parecido todos los días de la semana.";
  return `Gastas más ${days}: ${insight.pct}% más que el promedio de los otros días.`;
}

/** Lo que se gastó del 1 al 15 de cada mes y del 16 al fin de mes. */
export function halves(days: Map<string, DayTotal>): { first: number; second: number } {
  const first: number[] = [];
  const second: number[] = [];
  for (const [date, { total }] of days) (Number(date.slice(8, 10)) <= 15 ? first : second).push(total);
  return { first: sumAmounts(first), second: sumAmounts(second) };
}

/** El mes del calendario (`?calendario=2026-09`): uno del período; si no, el último (el actual, en curso). */
export function calendarMonth(param: unknown, period: ReportPeriod): Month {
  const month = parseMonthParam(param);
  const last = period.months[period.months.length - 1];
  return month && period.months.some((m) => compareMonths(m, month) === 0) ? month : last;
}

/** La dirección de Reportes con el calendario en `month` (sin `?calendario=` si es el último del período). */
export function calendarHref(period: ReportPeriod, month: Month): string {
  const params = new URLSearchParams();
  if (period.id !== LAST_12_MONTHS) params.set("periodo", period.id);
  if (compareMonths(month, period.months[period.months.length - 1]) !== 0) params.set("calendario", monthParam(month));
  const query = params.toString();
  return query ? `/reportes?${query}` : "/reportes";
}

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** "lunes", …, "domingo" (0 es el lunes). */
export const weekdayName = (weekday: number) => WEEKDAYS[weekday];

/** "lunes" → "los lunes"; "sábado" → "los sábados". */
export const weekdayPlural = (weekday: number) => `los ${WEEKDAYS[weekday]}${WEEKDAYS[weekday].endsWith("s") ? "" : "s"}`;

/** Un día del calendario, con sus textos ya armados (iguales en el servidor y en el navegador). */
export type CalendarDay = {
  date: string;
  day: number;
  /** "Sábado 10 de oct": el título del detalle. */
  title: string;
  total: number;
  count: number;
  level: HeatLevel;
  /** Todavía no llega (un mes en curso). */
  future: boolean;
  expenses: ExpenseRow[];
};

/**
 * Los días de `month`, con lo que se gastó en cada uno (`days`), su tono y sus egresos (`expenses`, ya
 * sin los fijos y en orden). Los días después de `today` quedan como futuros.
 */
export function calendarDays(
  month: Month,
  days: Map<string, DayTotal>,
  levelOf: (total: number) => HeatLevel,
  expenses: ExpenseRow[],
  today: string,
): CalendarDay[] {
  const lastDay = Number(lastDayOf(month).slice(8));
  return Array.from({ length: lastDay }, (_, i) => {
    const date = `${monthParam(month)}-${String(i + 1).padStart(2, "0")}`;
    const name = weekdayName(weekdayOf(date));
    const { total, count } = days.get(date) ?? { total: 0, count: 0 };
    return {
      date,
      day: i + 1,
      title: `${name.charAt(0).toUpperCase()}${name.slice(1)} ${formatShortDate(date)}`,
      total,
      count,
      level: levelOf(total),
      future: date > today,
      expenses: expenses.filter((expense) => expense.occurredOn === date),
    };
  });
}
