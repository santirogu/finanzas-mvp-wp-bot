import { compareMonths, formatMonthLabel, formatMonthName, formatShortDate, formatShortMonth, type Month, monthOf } from "@/lib/dates";
import { formatMoney, formatShare } from "@/lib/money";
import { NO_CATEGORY } from "@/modules/transactions/search";
import { BIGGEST_SHOWN } from "../biggest";
import { averagedPhrase } from "../categories";
import { averagedRange, type DayDescriptionTotal, dayTotals, halves, insightPhrase, weekdayAverages, weekdayInsight, weekdayName } from "../daily";
import { lastChangeSummary } from "../history";
import type { ReportPeriod } from "../period";
import type { Report } from "../queries";
import { RECURRING_MIN_MONTHS, RECURRING_WINDOW } from "../recurring";
import { averageNote, savedNote } from "../summary";
import { PDF_COLORS } from "./colors";

// El "Reporte (PDF)" de Reportes: lo mismo que muestra la página (src/app/(app)/reportes/page.tsx) para
// el período elegido, con todos los textos ya armados. src/modules/reports/pdf/document.tsx solo los
// acomoda en la hoja; así, lo que dice el PDF se prueba aquí, sin dibujarlo.

/** Las flechas de una comparación (las de la app son íconos; en el PDF, letras de la fuente). */
const ARROWS = { up: "↗", down: "↘", same: "=" } as const;

const CURRENCY_NAMES: Record<string, string> = { COP: "pesos colombianos (COP)" };

type Tone = "income" | "expense" | "default";

export type ReportPdfView = {
  /** "De noviembre de 2025 a octubre de 2026". */
  range: string;
  name: string;
  /** "Generado el 20 de octubre de 2026". */
  generated: string;
  /** "Montos en pesos colombianos (COP)". */
  currency: string;
  /** Sin movimientos en ningún mes: el PDF solo dice eso. */
  empty: string | null;
  stats: { label: string; value: string; note: string | null; tone: Tone }[];
  chart: {
    bars: { short: string; year: string | null; income: number; expense: number; inProgress: boolean }[];
    /** El tope del eje y sus marcas (de 0 al tope), con su texto ("$2 M"). */
    max: number;
    ticks: { value: number; label: string }[];
  };
  /** Del más reciente al más antiguo, como la tabla de la página. */
  months: { label: string; inProgress: boolean; income: string; expense: string; balance: string; negative: boolean }[];
  categories: {
    intro: string;
    rows: { name: string; amount: string; share: string; width: number; color: string; change: string | null }[];
    empty: string | null;
  };
  fixed: {
    intro: string;
    rows: { description: string; detail: string; amount: string }[];
    total: string;
    note: string | null;
    empty: string | null;
  };
  biggest: { rows: { description: string; detail: string; amount: string }[]; empty: string | null };
  daily: {
    weekdays: { label: string; amount: string; width: number }[];
    insight: string | null;
    halves: { label: string; amount: string; share: string }[];
    empty: string | null;
  };
};

/** El tope "redondo" del eje (1, 2, 2,5 o 5 por una potencia de 10) y de a cuánto van las marcas, para unas 4 marcas. */
export function chartScale(top: number): { max: number; step: number } {
  if (top <= 0) return { max: 1, step: 1 };
  const raw = top / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= raw)! * magnitude;
  return { max: Math.ceil(top / step) * step, step };
}

const compact = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** El texto de una marca del eje: "$0", "$500", "$250 mil", "$2,5 M". */
export function axisLabel(value: number): string {
  if (value >= 1_000_000) return `$${compact.format(value / 1_000_000)} M`;
  if (value >= 1_000) return `$${compact.format(value / 1_000)} mil`;
  return `$${compact.format(value)}`;
}

const capitalize = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export function reportPdfView({
  report,
  period,
  byDay,
  current,
  today,
  name,
  currency,
}: {
  report: Report;
  period: ReportPeriod;
  /** Los egresos por día del período (getExpensesByDay). */
  byDay: DayDescriptionTotal[];
  /** El mes en curso y el día de hoy (YYYY-MM-DD), en la zona de la persona. */
  current: Month;
  today: string;
  name: string;
  currency: string;
}): ReportPdfView {
  const money = (n: number) => formatMoney(n, currency);
  const { summary, categories, recurring } = report;
  const noExpenses = summary.expense > 0 ? "Todos los egresos del período son gastos fijos." : "Sin egresos en el período.";

  const top = Math.max(0, ...report.series.flatMap((point) => [point.income, point.expense]));
  const { max, step } = chartScale(top);

  const biggestCategory = categories.rows[0]?.share ?? 1;

  const days = dayTotals(byDay, recurring.items);
  const { from, to } = averagedRange(period.months, report.activeMonths.at(-1) ?? null, today);
  const averages = weekdayAverages(days, from, to);
  const topWeekday = Math.max(...averages);
  const half = halves(days);

  return {
    range: period.range,
    name,
    generated: `Generado el ${Number(today.slice(8, 10))} de ${formatMonthName(monthOf(today), { withYear: true })}`,
    currency: `Montos en ${CURRENCY_NAMES[currency] ?? currency}`,
    empty: report.activeMonths.length === 0 ? "Aún no tienes movimientos." : null,
    stats: [
      { label: "Ingresos", value: money(summary.income), note: null, tone: "income" },
      { label: "Egresos", value: money(summary.expense), note: null, tone: "expense" },
      { label: "Balance del período", value: money(summary.balance), note: savedNote(summary.saved) ?? null, tone: summary.balance < 0 ? "expense" : "default" },
      {
        label: "Gasto promedio por mes",
        value: summary.averageExpense ? money(summary.averageExpense.amount) : "—",
        note: averageNote(summary.averageExpense, current),
        tone: "default",
      },
      {
        label: "El mes de más gasto",
        value: summary.topMonth ? formatMonthLabel(summary.topMonth.month) : "—",
        note: summary.topMonth ? money(summary.topMonth.expense) : "Sin egresos en el período",
        tone: "default",
      },
    ],
    chart: {
      bars: report.series.map((point, i) => ({
        short: formatShortMonth(point.month),
        year: i === 0 || point.month.month === 1 ? String(point.month.year) : null,
        income: point.income,
        expense: point.expense,
        inProgress: compareMonths(point.month, current) === 0,
      })),
      max,
      ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => ({ value: i * step, label: axisLabel(i * step) })),
    },
    months: [...report.series].reverse().map((point) => ({
      label: formatMonthLabel(point.month),
      inProgress: compareMonths(point.month, current) === 0,
      income: money(point.income),
      expense: money(point.expense),
      balance: money(point.balance),
      negative: point.balance < 0,
    })),
    categories: {
      intro: `Lo que sumó cada una en el período${
        categories.compared && categories.averaged.length > 0
          ? `, y cómo te fue en ${formatMonthName(categories.compared)} frente a su promedio de ${averagedPhrase(categories.averaged)}.`
          : "."
      }`,
      rows: categories.rows.map((row) => ({
        name: row.name,
        amount: money(row.total),
        share: `${formatShare(row.total, categories.total)}%`,
        width: row.share / biggestCategory,
        color: row.color === null ? PDF_COLORS.chartRest : PDF_COLORS.chart[row.color],
        change: row.change && `${ARROWS[row.change.direction]} ${row.change.text}`,
      })),
      empty: categories.rows.length === 0 ? "Sin egresos en el período." : null,
    },
    fixed: {
      intro: `Los egresos con la misma descripción en al menos ${RECURRING_MIN_MONTHS} de los últimos ${RECURRING_WINDOW} meses, y los que agregaste tú.`,
      rows: recurring.items.map((item) => {
        const change = lastChangeSummary(report.histories[item.key] ?? [], current);
        const months = `En ${item.months} de ${period.months.length} ${period.months.length === 1 ? "mes" : "meses"}`;
        return {
          description: item.description,
          detail: change ? `${months} · ${ARROWS[change.direction]} ${change.text}` : months,
          amount: `−${money(item.amount)}`,
        };
      }),
      total: `−${money(recurring.total)}`,
      note: summary.averageExpense ? `Son el ${formatShare(recurring.total, summary.averageExpense.amount)}% de tu gasto promedio por mes.` : null,
      empty: recurring.items.length === 0 ? "Todavía no hay egresos que se repitan cada mes." : null,
    },
    biggest: {
      rows: report.biggest.slice(0, BIGGEST_SHOWN).map((expense) => ({
        description: expense.description,
        detail: `${formatShortDate(expense.occurredOn, { withYear: Number(expense.occurredOn.slice(0, 4)) !== current.year })} · ${expense.categoryName ?? NO_CATEGORY}`,
        amount: `−${money(expense.amount)}`,
      })),
      empty: report.biggest.length === 0 ? noExpenses : null,
    },
    daily: {
      weekdays: averages.map((average, weekday) => ({
        label: capitalize(weekdayName(weekday)),
        amount: money(average),
        width: topWeekday > 0 ? average / topWeekday : 0,
      })),
      insight: insightPhrase(weekdayInsight(averages)),
      halves: [
        { label: "Del 1 al 15", amount: money(half.first), share: `${formatShare(half.first, half.first + half.second)}% del gasto` },
        { label: "Del 16 a fin de mes", amount: money(half.second), share: `${formatShare(half.second, half.first + half.second)}% del gasto` },
      ],
      empty: days.size === 0 ? noExpenses : null,
    },
  };
}
