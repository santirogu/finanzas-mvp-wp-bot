import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { compareMonths, formatMonthLabel, formatMonthName, formatShortDate, formatShortMonth, type Month, monthOf } from "@/lib/dates";
import { formatMoney, formatPercent, formatShare } from "@/lib/money";
import { NO_CATEGORIES } from "@/modules/transactions/search";
import { BIGGEST_SHOWN } from "../biggest";
import { averagedPhrase } from "../categories";
import { averagedRange, type DayDescriptionTotal, dayTotals, halves, insightPhrase, weekdayAverages, weekdayInsight, weekdayName } from "../daily";
import type { ReportPeriod } from "../period";
import type { Report } from "../queries";
import { averageNote, savedNote } from "../summary";
import { PDF_COLORS } from "./colors";

// El "Reporte (PDF)" de Reportes: lo mismo que muestra la página (src/app/[lang]/(app)/reportes/page.tsx) para
// el período elegido, con todos los textos ya armados. Como la página, sin los gastos fijos (tienen su
// pestaña): solo salen de los gastos más grandes y del gasto por día. src/modules/reports/pdf/document.tsx solo los
// acomoda en la hoja; así, lo que dice el PDF se prueba aquí, sin dibujarlo.

/** Las flechas de una comparación (las de la app son íconos; en el PDF, letras de la fuente). */
const ARROWS = { up: "↗", down: "↘", same: "=" } as const;

const TEXTS = texts(
  {
    labels: {
      title: "Reporte de tus finanzas",
      income: "Ingresos",
      expenses: "Egresos",
      byMonth: "Ingresos y egresos por mes",
      monthByMonth: "Mes a mes",
      month: "Mes",
      balance: "Balance",
      inProgress: " (en curso)",
      categories: "Egresos por categoría",
      biggest: "Los egresos más grandes",
      biggestIntro: "Los egresos más altos del período, sin contar los gastos fijos.",
      daily: "¿Qué días gastas más?",
      dailyIntro: "El gasto promedio de cada día de la semana, sin los gastos fijos y contando los días sin gastos.",
      page: (page: number, total: number) => `Página ${page} de ${total}`,
      language: INTL_LOCALES.es,
    },
    generated: (day: number, month: string, year: number) => `Generado el ${day} de ${month} de ${year}`,
    currency: (name: string) => `Montos en ${name}`,
    currencies: { COP: "pesos colombianos (COP)" } as Record<string, string>,
    empty: "Aún no tienes movimientos.",
    allFixed: "Todos los egresos del período son gastos fijos.",
    noExpenses: "Sin egresos en el período.",
    noExpensesNote: "Sin egresos en el período",
    balance: "Balance del período",
    average: "Gasto promedio por mes",
    topMonth: "El mes de más gasto",
    categoriesIntro: "Lo que sumó cada una en el período",
    categoriesCompared: (month: string, averaged: string) => `, y cómo te fue en ${month} frente a su promedio de ${averaged}.`,
    firstHalf: "Del 1 al 15",
    secondHalf: "Del 16 a fin de mes",
    halfShare: (pct: string) => `${formatPercent(pct, "es")} del gasto`,
    thousand: "mil",
  },
  {
    en: {
      labels: {
        title: "Your finances report",
        income: "Income",
        expenses: "Expenses",
        byMonth: "Income and expenses by month",
        monthByMonth: "Month by month",
        month: "Month",
        balance: "Balance",
        inProgress: " (in progress)",
        categories: "Expenses by category",
        biggest: "The biggest expenses",
        biggestIntro: "The highest expenses in the period, not counting your bills.",
        daily: "Which days do you spend the most?",
        dailyIntro: "The average spending for each day of the week, without your bills and counting the days without spending.",
        page: (page, total) => `Page ${page} of ${total}`,
        language: INTL_LOCALES.en,
      },
      generated: (day, month, year) => `Generated on ${month} ${day}, ${year}`,
      currency: (name) => `Amounts in ${name}`,
      currencies: { COP: "Colombian pesos (COP)" },
      empty: "You don't have transactions yet.",
      allFixed: "All the expenses in the period are bills.",
      noExpenses: "No expenses in the period.",
      noExpensesNote: "No expenses in the period",
      balance: "Balance for the period",
      average: "Average spending per month",
      topMonth: "The month with the most spending",
      categoriesIntro: "What each one added up to in the period",
      categoriesCompared: (month, averaged) => `, and how you did in ${month} compared with its average for ${averaged}.`,
      firstHalf: "1st to 15th",
      secondHalf: "16th to month end",
      halfShare: (pct) => `${pct}% of spending`,
      thousand: "K",
    },
  },
);

type Tone = "income" | "expense" | "default";

export type ReportPdfView = {
  /** Los textos fijos de la hoja (títulos, encabezados, el pie), en el idioma del reporte. */
  labels: (typeof TEXTS)["es"]["labels"];
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

const compacts: Readonly<Record<Locale, Intl.NumberFormat>> = {
  es: new Intl.NumberFormat(INTL_LOCALES.es, { maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat(INTL_LOCALES.en, { maximumFractionDigits: 1 }),
};

/** El texto de una marca del eje: "$0", "$500", "$250 mil", "$2,5 M" (en inglés, "$250 K" y "$2.5 M"). */
export function axisLabel(value: number, locale: Locale = DEFAULT_LOCALE): string {
  const compact = compacts[locale];
  if (value >= 1_000_000) return `$${compact.format(value / 1_000_000)} M`;
  if (value >= 1_000) return `$${compact.format(value / 1_000)} ${TEXTS[locale].thousand}`;
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
  locale = DEFAULT_LOCALE,
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
  /** El idioma del reporte (el de la página desde la que se descargó). */
  locale?: Locale;
}): ReportPdfView {
  const t = TEXTS[locale];
  const money = (n: number) => formatMoney(n, currency, locale);
  const { summary, categories, recurring } = report;
  const noExpenses = summary.expense > 0 ? t.allFixed : t.noExpenses;

  const top = Math.max(0, ...report.series.flatMap((point) => [point.income, point.expense]));
  const { max, step } = chartScale(top);

  const biggestCategory = categories.rows[0]?.share ?? 1;

  const days = dayTotals(byDay, recurring.items);
  const { from, to } = averagedRange(period.months, report.activeMonths.at(-1) ?? null, today);
  const averages = weekdayAverages(days, from, to);
  const topWeekday = Math.max(...averages);
  const half = halves(days);

  const stats: ReportPdfView["stats"] = [
    { label: t.labels.income, value: money(summary.income), note: null, tone: "income" },
    { label: t.labels.expenses, value: money(summary.expense), note: null, tone: "expense" },
    { label: t.balance, value: money(summary.balance), note: savedNote(summary.saved, locale) ?? null, tone: summary.balance < 0 ? "expense" : "default" },
  ];
  // Con un solo mes, como en la página, sin el promedio ni el mes de más gasto (repetirían los egresos).
  if (period.months.length > 1) {
    stats.push(
      {
        label: t.average,
        value: summary.averageExpense ? money(summary.averageExpense.amount) : "—",
        note: averageNote(summary.averageExpense, current, locale),
        tone: "default",
      },
      {
        label: t.topMonth,
        value: summary.topMonth ? formatMonthLabel(summary.topMonth.month, locale) : "—",
        note: summary.topMonth ? money(summary.topMonth.expense) : t.noExpensesNote,
        tone: "default",
      },
    );
  }

  return {
    labels: t.labels,
    range: period.range,
    name,
    generated: t.generated(Number(today.slice(8, 10)), formatMonthName(monthOf(today), { locale }), Number(today.slice(0, 4))),
    currency: t.currency(t.currencies[currency] ?? currency),
    empty: report.activeMonths.length === 0 ? t.empty : null,
    stats,
    chart: {
      bars: report.series.map((point, i) => ({
        short: formatShortMonth(point.month, locale),
        year: i === 0 || point.month.month === 1 ? String(point.month.year) : null,
        income: point.income,
        expense: point.expense,
        inProgress: compareMonths(point.month, current) === 0,
      })),
      max,
      ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => ({ value: i * step, label: axisLabel(i * step, locale) })),
    },
    months: [...report.series].reverse().map((point) => ({
      label: formatMonthLabel(point.month, locale),
      inProgress: compareMonths(point.month, current) === 0,
      income: money(point.income),
      expense: money(point.expense),
      balance: money(point.balance),
      negative: point.balance < 0,
    })),
    categories: {
      intro: `${t.categoriesIntro}${
        categories.compared && categories.averaged.length > 0
          ? t.categoriesCompared(formatMonthName(categories.compared, { locale }), averagedPhrase(categories.averaged, locale))
          : "."
      }`,
      rows: categories.rows.map((row) => ({
        name: row.name,
        amount: money(row.total),
        share: formatPercent(formatShare(row.total, categories.total), locale),
        width: row.share / biggestCategory,
        color: row.color === null ? PDF_COLORS.chartRest : PDF_COLORS.chart[row.color],
        change: row.change && `${ARROWS[row.change.direction]} ${row.change.text}`,
      })),
      empty: categories.rows.length === 0 ? t.noExpenses : null,
    },
    biggest: {
      rows: report.biggest.slice(0, BIGGEST_SHOWN).map((expense) => ({
        description: expense.description,
        detail: `${formatShortDate(expense.occurredOn, { withYear: Number(expense.occurredOn.slice(0, 4)) !== current.year, locale })} · ${expense.categoryName ?? NO_CATEGORIES[locale]}`,
        amount: `−${money(expense.amount)}`,
      })),
      empty: report.biggest.length === 0 ? noExpenses : null,
    },
    daily: {
      weekdays: averages.map((average, weekday) => ({
        label: capitalize(weekdayName(weekday, locale)),
        amount: money(average),
        width: topWeekday > 0 ? average / topWeekday : 0,
      })),
      insight: insightPhrase(weekdayInsight(averages), locale),
      halves: [
        { label: t.firstHalf, amount: money(half.first), share: t.halfShare(formatShare(half.first, half.first + half.second)) },
        { label: t.secondHalf, amount: money(half.second), share: t.halfShare(formatShare(half.second, half.first + half.second)) },
      ],
      empty: days.size === 0 ? noExpenses : null,
    },
  };
}
