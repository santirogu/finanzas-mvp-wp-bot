import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { type Month, monthOf, monthParam, shiftMonth } from "@/lib/dates";
import { sumAmounts } from "@/lib/money";
import { biggestExpenses, type ExpenseRow } from "@/modules/reports/biggest";
import { categoryReport } from "@/modules/reports/categories";
import type { DayDescriptionTotal } from "@/modules/reports/daily";
import { type ReportPeriod, reportPeriod } from "@/modules/reports/period";
import type { Report } from "@/modules/reports/queries";
import { recurringExpenses } from "@/modules/reports/recurring";
import { monthSeries, periodSummary } from "@/modules/reports/summary";
import { NO_CATEGORIES } from "@/modules/transactions/search";

// Un año de movimientos de ejemplo (sueldo, arriendo, mercado, salidas…) y el reporte que arma Reportes
// con ellos, sin la base: con las mismas funciones que usa getReport (src/modules/reports/queries.ts).
// Para las pruebas del PDF. Sin datos al azar: cada monto sale de la posición del mes o del día.

export type SampleMovement = {
  date: string;
  type: "income" | "expense";
  description: string;
  category: string | null;
  emoji: string;
  amount: number;
};

const day = (month: Month, d: number) => `${monthParam(month)}-${String(d).padStart(2, "0")}`;

/** Doce meses que terminan en `current` (en curso hasta `today`). */
export function sampleMovements(current: Month, today: string): SampleMovement[] {
  const movements: SampleMovement[] = [];
  const add = (date: string, type: SampleMovement["type"], description: string, category: string | null, emoji: string, amount: number) => {
    if (date <= today) movements.push({ date, type, description, category, emoji, amount });
  };
  for (let i = 11; i >= 0; i--) {
    const month = shiftMonth(current, -i);
    const n = 11 - i;
    add(day(month, 1), "income", "Salario", "Salario", "💼", 4650000);
    if (month.month === 6 || month.month === 12) add(day(month, 20), "income", "Prima", "Salario", "💼", 2300000);
    add(day(month, 5), "expense", "Arriendo", "Vivienda", "🏠", 1800000);
    add(day(month, 5), "expense", "Administración", "Vivienda", "🏠", n >= 2 ? 185000 : 175000);
    add(day(month, 8), "expense", "Gimnasio", "Salud", "💊", n >= 4 ? 120000 : 110000);
    add(day(month, 10), "expense", "Internet y TV", "Servicios", "💡", 119900);
    add(day(month, 12), "expense", "Plan del celular", "Servicios", "💡", 55000);
    add(day(month, 14), "expense", "Netflix", "Entretenimiento", "🎬", n >= 8 ? 44900 : 38900);
    // Cuatro veces al mes con la misma descripción: no son gastos fijos (esos van hasta dos veces al mes).
    for (const [k, d] of [3, 10, 17, 24].entries()) add(day(month, d), "expense", "Mercado", "Mercado", "🛒", 300000 + ((n * 37 + k * 53) % 9) * 25000);
    for (const [k, d] of [6, 13, 20, 27].entries()) add(day(month, d), "expense", "Restaurante", "Restaurantes", "🍽️", 60000 + ((n * 11 + k * 7) % 6) * 20000);
    for (const [k, d] of [2, 9, 16, 23].entries()) add(day(month, d), "expense", "Taxi", null, "•", 18000 + ((n + k) % 4) * 6000);
  }
  const big: [number, number, string, string, string, number][] = [
    [-10, 12, "Tiquetes a Cartagena", "Entretenimiento", "🎬", 1240000],
    [-4, 3, "Lavadora", "Vivienda", "🏠", 1150000],
    [-9, 20, "Odontólogo", "Salud", "💊", 680000],
    [-10, 24, "Regalos de Navidad", "Otros", "📦", 540000],
    [-5, 8, "Revisión del carro", "Transporte", "🚗", 455000],
    [-1, 30, "Cena de aniversario", "Restaurantes", "🍽️", 312000],
  ];
  for (const [shift, d, description, category, emoji, amount] of big) add(day(shiftMonth(current, shift), d), "expense", description, category, emoji, amount);
  return movements.sort((a, b) => a.date.localeCompare(b.date));
}

/** Suma por clave: lo que hace GROUP BY en las consultas de Reportes. */
function groupSum<T>(items: SampleMovement[], key: (m: SampleMovement) => string, make: (first: SampleMovement, group: SampleMovement[]) => T): T[] {
  const groups = new Map<string, SampleMovement[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return [...groups.values()].map((group) => make(group[0], group));
}

const total = (group: SampleMovement[]) => sumAmounts(group.map((m) => m.amount));
const monthKey = (m: SampleMovement) => m.date.slice(0, 7);

/** El reporte de los últimos 12 meses, como lo arma getReport, y los egresos por día del período. */
export function sampleReport(
  movements: SampleMovement[],
  current: Month,
  locale: Locale = DEFAULT_LOCALE,
  /** El `?periodo=` (sin él, los últimos 12 meses). */
  periodParam?: string,
): { report: Report; period: ReportPeriod; byDay: DayDescriptionTotal[] } {
  const period = reportPeriod(periodParam, current, locale);
  const expenses = movements.filter((m) => m.type === "expense");
  const activeMonths = [...new Set(movements.map(monthKey))].sort().reverse();
  const series = monthSeries(
    period.months,
    groupSum(movements, monthKey, (first, group) => ({
      month: monthKey(first),
      income: total(group.filter((m) => m.type === "income")),
      expense: total(group.filter((m) => m.type === "expense")),
    })),
  );
  const descriptions = groupSum(
    expenses,
    (m) => `${monthKey(m)} ${m.description}`,
    (first, group) => ({ month: monthKey(first), description: first.description, emoji: first.emoji, count: group.length, total: total(group), latest: group[group.length - 1].date }),
  );
  const recurring = recurringExpenses(descriptions, period.months);
  const largest: ExpenseRow[] = expenses
    .map((m, i) => ({ id: `gasto-${i}`, description: m.description, amount: m.amount, occurredOn: m.date, categoryName: m.category, categoryEmoji: m.category ? m.emoji : null }))
    .sort((a, b) => b.amount - a.amount);
  const firstActive = activeMonths.length > 0 ? monthOf(`${activeMonths[activeMonths.length - 1]}-01`) : null;
  const report: Report = {
    activeMonths,
    series,
    summary: periodSummary(series, current, firstActive),
    categories: categoryReport(
      groupSum(
        expenses,
        (m) => `${monthKey(m)} ${m.category}`,
        (first, group) => ({ month: monthKey(first), name: first.category ?? NO_CATEGORIES[locale], emoji: first.emoji, total: total(group) }),
      ),
      period.months,
      current,
      new Set(activeMonths),
      locale,
    ),
    recurring,
    biggest: biggestExpenses(largest, recurring.items),
  };
  const byDay = groupSum(
    expenses,
    (m) => `${m.date} ${m.description}`,
    (first, group) => ({ day: first.date, description: first.description, total: total(group), count: group.length }),
  );
  return { report, period, byDay };
}
