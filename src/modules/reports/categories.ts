import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { compareMonths, formatMonthName, type Month, monthParam, shiftMonth } from "@/lib/dates";
import { roundToCents, sumAmounts } from "@/lib/money";
import { MAX_SLICES } from "@/modules/transactions/category-chart";

// "Gastos por categoría" de Reportes: cuánto se fue en cada una en el período y cómo le fue a cada una
// en el último mes completo frente a su promedio de los meses anteriores.

/** Cuántos meses antes del comparado se promedian. */
export const AVERAGE_MONTHS = 3;

/** Lo que sumó una categoría de egresos en un mes ("YYYY-MM"), como lo da la base. */
export type CategoryMonthTotal = { month: string; name: string; emoji: string; total: number };

export type CategoryChange = { direction: "up" | "down" | "same"; text: string };

export type CategoryRow = {
  name: string;
  emoji: string;
  /** Lo que sumó en el período. */
  total: number;
  /** Qué parte de los egresos del período (0 a 1). */
  share: number;
  /** Su puesto en la paleta de los gráficos (0 = --chart-1); null, en gris (--chart-rest). */
  color: number | null;
  /** El último mes completo frente a su promedio; null si no hay con qué comparar. */
  change: CategoryChange | null;
};

export type CategoryReport = {
  rows: CategoryRow[];
  /** Los egresos del período (la suma de todas). */
  total: number;
  /** El mes que se compara (el último completo del período); null si el período no tiene ninguno. */
  compared: Month | null;
  /** Los meses del promedio: hasta AVERAGE_MONTHS antes del comparado, solo los que tienen movimientos. */
  averaged: Month[];
};

// El porcentaje ya llega redondeado: el formato solo le pone el punto de los miles ("1.500%").
const percents: Readonly<Record<Locale, Intl.NumberFormat>> = {
  es: new Intl.NumberFormat(INTL_LOCALES.es),
  en: new Intl.NumberFormat(INTL_LOCALES.en),
};

const TEXTS = texts(
  {
    two: (a: string, b: string) => `${a} y ${b}`,
    span: (a: string, b: string) => `${a} a ${b}`,
    isNew: (month: string) => `Nueva en ${month}`,
    none: (month: string) => `Sin gastos en ${month}`,
    same: (month: string) => `En ${month}, igual que su promedio`,
    more: (month: string, pct: string) => `En ${month}, ${pct}% más que su promedio`,
    less: (month: string, pct: string) => `En ${month}, ${pct}% menos que su promedio`,
  },
  {
    en: {
      two: (a, b) => `${a} and ${b}`,
      span: (a, b) => `${a} to ${b}`,
      isNew: (month) => `New in ${month}`,
      none: (month) => `No spending in ${month}`,
      same: (month) => `In ${month}, the same as its average`,
      more: (month, pct) => `In ${month}, ${pct}% more than its average`,
      less: (month, pct) => `In ${month}, ${pct}% less than its average`,
    },
  },
);

const key = (row: { name: string; emoji: string }) => `${row.emoji} ${row.name}`;

/**
 * Las categorías del período, de la que más sumó a la que menos. `rows` trae los totales por mes de
 * los meses del período y de los AVERAGE_MONTHS anteriores al comparado (pueden quedar fuera del
 * período). `activeMonths` ("YYYY-MM") son los meses en que la persona tiene movimientos: un mes antes
 * de que empezara a usar la app no cuenta para el promedio (lo bajaría).
 */
export function categoryReport(
  rows: CategoryMonthTotal[],
  period: Month[],
  current: Month,
  activeMonths: Set<string>,
  locale: Locale = DEFAULT_LOCALE,
): CategoryReport {
  const inPeriod = new Set(period.map(monthParam));
  const compared = period.findLast((month) => compareMonths(month, current) < 0) ?? null;
  const averaged = compared
    ? Array.from({ length: AVERAGE_MONTHS }, (_, i) => shiftMonth(compared, -AVERAGE_MONTHS + i)).filter((month) =>
        activeMonths.has(monthParam(month)),
      )
    : [];

  const totals = new Map<string, { name: string; emoji: string; byMonth: Map<string, number> }>();
  for (const row of rows) {
    const entry = totals.get(key(row)) ?? { name: row.name, emoji: row.emoji, byMonth: new Map<string, number>() };
    entry.byMonth.set(row.month, sumAmounts([entry.byMonth.get(row.month) ?? 0, row.total]));
    totals.set(key(row), entry);
  }

  const categories = [...totals.values()]
    .map((entry) => ({
      ...entry,
      total: sumAmounts([...entry.byMonth].filter(([month]) => inPeriod.has(month)).map(([, total]) => total)),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
  const periodTotal = sumAmounts(categories.map((entry) => entry.total));

  return {
    compared,
    averaged,
    total: periodTotal,
    rows: categories.map((entry, i) => ({
      name: entry.name,
      emoji: entry.emoji,
      total: entry.total,
      share: entry.total / periodTotal,
      color: i < MAX_SLICES ? i : null,
      change:
        compared && averaged.length > 0
          ? categoryChange(
              entry.byMonth.get(monthParam(compared)) ?? 0,
              sumAmounts(averaged.map((month) => entry.byMonth.get(monthParam(month)) ?? 0)) / averaged.length,
              formatMonthName(compared, { locale }),
              locale,
            )
          : null,
    })),
  };
}

/** Los meses del promedio, en una frase: "agosto", "julio y agosto" o "junio a agosto". */
export function averagedPhrase(averaged: Month[], locale: Locale = DEFAULT_LOCALE): string {
  const t = TEXTS[locale];
  const names = averaged.map((month) => formatMonthName(month, { locale }));
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return t.two(names[0], names[1]);
  return t.span(names[0], names[names.length - 1]);
}

/**
 * Lo que gastó en una categoría en el mes comparado frente a su promedio: "En septiembre, 40% más que
 * su promedio". null si no hubo nada ni en ese mes ni en los anteriores.
 */
export function categoryChange(month: number, average: number, monthName: string, locale: Locale = DEFAULT_LOCALE): CategoryChange | null {
  const t = TEXTS[locale];
  if (month === 0 && average === 0) return null;
  if (average === 0) return { direction: "up", text: t.isNew(monthName) };
  if (month === 0) return { direction: "down", text: t.none(monthName) };
  const diff = roundToCents(month - average);
  const pct = Math.round((Math.abs(diff) / average) * 100);
  if (pct === 0) return { direction: "same", text: t.same(monthName) };
  // Stryker disable next-line EqualityOperator: aquí diff nunca es cero (con cero, el 0 % ya devolvió "igual")
  const more = diff > 0;
  const share = percents[locale].format(pct);
  return { direction: more ? "up" : "down", text: more ? t.more(monthName, share) : t.less(monthName, share) };
}
