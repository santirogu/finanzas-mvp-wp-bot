import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { formatMonthName, type Month, monthParam } from "@/lib/dates";
import { formatMoney, formatPercent, roundToCents, sumAmounts } from "@/lib/money";

// El dato del mes del Resumen: la categoría de egresos que más se salió de lo normal en el mes en curso, frente a
// lo que la persona solía llevar a esta altura (del 1 al mismo día) en los meses anteriores. Sin los gastos fijos:
// pagar el arriendo un día antes que otros meses no es un cambio de hábito. Decisiones del dueño: la que más subió
// en plata (con un mínimo, para que $5.000 → $20.000 no salga como "300 % más") y, si ninguna subió, la que más
// bajó.

/** Lo mínimo que tiene que cambiar, en porcentaje y en plata (pesos colombianos, la moneda de la app). */
export const FACT_MIN_SHARE = 20;
export const FACT_MIN_AMOUNT = 20000;

/** Lo que llevaba una categoría de egresos a esta altura de un mes ("YYYY-MM"), sin los gastos fijos. */
export type CategoryToDate = { month: string; name: string; emoji: string; total: number };

export type MonthFact = {
  direction: "up" | "down";
  name: string;
  emoji: string;
  /** Lo que lleva en el mes en curso. */
  current: number;
  /** Lo que solía llevar a esta altura: el promedio de los meses anteriores. */
  average: number;
  /** Cuánto más o menos, en porcentaje redondeado; null si antes no gastaba nada ahí. */
  pct: number | null;
  /** Los meses del promedio: con uno, la frase lo nombra ("a esta altura de septiembre"). */
  averaged: Month[];
};

/**
 * El dato del mes en curso (`current`), frente al promedio de los meses `averaged` (los anteriores en que la
 * persona tuvo movimientos). null si no hay con qué comparar o nada se salió lo suficiente.
 */
export function monthFact(rows: CategoryToDate[], current: Month, averaged: Month[]): MonthFact | null {
  if (averaged.length === 0) return null;
  const now = monthParam(current);
  const before = new Set(averaged.map(monthParam));
  const categories = new Map<string, { name: string; emoji: string; current: number[]; before: number[] }>();
  for (const row of rows) {
    if (row.month !== now && !before.has(row.month)) continue;
    const key = `${row.emoji} ${row.name}`;
    const entry = categories.get(key) ?? { name: row.name, emoji: row.emoji, current: [], before: [] };
    (row.month === now ? entry.current : entry.before).push(row.total);
    categories.set(key, entry);
  }

  const changes = [...categories.values()].flatMap((entry) => {
    const current = sumAmounts(entry.current);
    const average = roundToCents(sumAmounts(entry.before) / averaged.length);
    const diff = roundToCents(current - average);
    const pct = average > 0 ? Math.round((Math.abs(diff) / average) * 100) : null;
    // Lo suficiente: el mínimo en plata y, si había con qué comparar, en porcentaje.
    if (Math.abs(diff) < FACT_MIN_AMOUNT || (pct !== null && pct < FACT_MIN_SHARE)) return [];
    return [{ name: entry.name, emoji: entry.emoji, current, average, pct, diff }];
  });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es");
  const up = changes.filter((c) => c.diff > 0).sort((a, b) => b.diff - a.diff || byName(a, b))[0];
  const down = changes.filter((c) => c.diff < 0).sort((a, b) => a.diff - b.diff || byName(a, b))[0];
  const pick = up ?? down;
  if (!pick) return null;
  return { direction: pick === up ? "up" : "down", name: pick.name, emoji: pick.emoji, current: pick.current, average: pick.average, pct: pick.pct, averaged };
}

const TEXTS = texts(
  {
    ref: (averaged: Month[]) =>
      averaged.length === 1 ? `a esta altura de ${formatMonthName(averaged[0], { locale: "es" })}` : `a esta altura en tus últimos ${averaged.length} meses`,
    more: (name: string, current: string, pct: string, ref: string) => `${name}: llevas ${current}, ${pct} más que ${ref}.`,
    less: (name: string, current: string, pct: string, ref: string) => `${name}: llevas ${current}, ${pct} menos que ${ref}.`,
    isNew: (name: string, current: string, ref: string) => `${name}: llevas ${current}, y ${ref} no gastabas en esto.`,
    none: (name: string, average: string, ref: string) => `${name}: no llevas nada, y ${ref} solías llevar ${average}.`,
  },
  {
    en: {
      ref: (averaged) =>
        averaged.length === 1 ? `by this point in ${formatMonthName(averaged[0], { locale: "en" })}` : `by this point in your last ${averaged.length} months`,
      more: (name, current, pct, ref) => `${name}: ${current} so far, ${pct} more than ${ref}.`,
      less: (name, current, pct, ref) => `${name}: ${current} so far, ${pct} less than ${ref}.`,
      isNew: (name, current, ref) => `${name}: ${current} so far, and ${ref} you didn't spend on it.`,
      none: (name, average, ref) => `${name}: nothing so far, and ${ref} you usually had ${average}.`,
    },
  },
);

/** El dato en una frase, en el idioma de la página: "Domicilios: llevas $180.000,00, 40 % más que a esta altura…". */
export function monthFactText(fact: MonthFact, currency: string, locale: Locale = DEFAULT_LOCALE): string {
  const t = TEXTS[locale];
  const money = (n: number) => formatMoney(n, currency, locale);
  const ref = t.ref(fact.averaged);
  if (fact.pct === null) return t.isNew(fact.name, money(fact.current), ref);
  if (fact.current === 0) return t.none(fact.name, money(fact.average), ref);
  const pct = formatPercent(new Intl.NumberFormat(INTL_LOCALES[locale]).format(fact.pct), locale);
  return fact.direction === "up" ? t.more(fact.name, money(fact.current), pct, ref) : t.less(fact.name, money(fact.current), pct, ref);
}
