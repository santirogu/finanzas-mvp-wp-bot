import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { formatMoney, formatPercent, roundToCents } from "@/lib/money";

/** Cómo le fue a un total frente al mes anterior: la flecha que lo acompaña y la frase. */
export type MonthChange = { direction: "up" | "down" | "same"; text: string };

/**
 * Contra qué se compara, para armar las frases: "más que agosto" / "sin egresos en agosto" con el mes entero, o
 * "más que a esta altura de agosto" / "sin egresos a esta altura de agosto" con el mes hasta el mismo día.
 */
export type Reference = { than: string; in: string };

const TEXTS = texts(
  {
    whole: (month: string): Reference => ({ than: month, in: `en ${month}` }),
    upToToday: (month: string): Reference => ({ than: `a esta altura de ${month}`, in: `a esta altura de ${month}` }),
    same: (ref: Reference) => `Igual que ${ref.than}`,
    almostSame: (ref: Reference) => `Casi igual que ${ref.than}`,
    more: (amount: string, ref: Reference) => `${amount} más que ${ref.than}`,
    less: (amount: string, ref: Reference) => `${amount} menos que ${ref.than}`,
    none: { income: (ref: Reference) => `Sin ingresos ${ref.in}`, expense: (ref: Reference) => `Sin egresos ${ref.in}` },
  },
  {
    en: {
      whole: (month) => ({ than: month, in: `in ${month}` }),
      upToToday: (month) => ({ than: `at this point in ${month}`, in: `at this point in ${month}` }),
      same: (ref) => `Same as ${ref.than}`,
      almostSame: (ref) => `Almost the same as ${ref.than}`,
      more: (amount, ref) => `${amount} more than ${ref.than}`,
      less: (amount, ref) => `${amount} less than ${ref.than}`,
      none: { income: (ref) => `No income ${ref.in}`, expense: (ref) => `No expenses ${ref.in}` },
    },
  },
);

/**
 * El mes anterior como referencia (`month`, su nombre en el idioma): entero o, si el mes que se mira está en curso,
 * hasta el mismo día (`upToToday`), porque a mitad de mes contra el mes entero casi todo daría "menos que".
 */
export const previousMonthReference = (month: string, upToToday: boolean, locale: Locale = DEFAULT_LOCALE): Reference =>
  upToToday ? TEXTS[locale].upToToday(month) : TEXTS[locale].whole(month);

// El porcentaje ya llega redondeado: el formato solo le pone el separador de los miles.
const percents: Readonly<Record<Locale, Intl.NumberFormat>> = {
  es: new Intl.NumberFormat(INTL_LOCALES.es),
  en: new Intl.NumberFormat(INTL_LOCALES.en),
};

/** El balance frente al del mes anterior, en plata: "$120.000,00 más que agosto" (`ref`, de `previousMonthReference`). */
export function balanceChange(current: number, previous: number, ref: Reference, currency?: string, locale: Locale = DEFAULT_LOCALE): MonthChange {
  const t = TEXTS[locale];
  const diff = roundToCents(current - previous);
  if (diff === 0) return { direction: "same", text: t.same(ref) };
  const amount = formatMoney(Math.abs(diff), currency, locale);
  return {
    // Stryker disable next-line EqualityOperator: una diferencia de 0 ya volvió arriba ("Igual que…")
    direction: diff > 0 ? "up" : "down",
    // Stryker disable next-line EqualityOperator: ídem
    text: diff > 0 ? t.more(amount, ref) : t.less(amount, ref),
  };
}

/**
 * Los ingresos o los egresos frente a los del mes anterior, en porcentaje: "15% más que agosto". Si el
 * mes anterior no tuvo (`previous` en cero), no hay porcentaje que dar: "Sin egresos en agosto".
 */
export function totalChange(
  current: number,
  previous: number,
  ref: Reference,
  kind: "income" | "expense",
  locale: Locale = DEFAULT_LOCALE,
): MonthChange {
  const t = TEXTS[locale];
  const diff = roundToCents(current - previous);
  if (diff === 0) return { direction: "same", text: t.same(ref) };
  // Stryker disable next-line EqualityOperator: ídem
  const direction = diff > 0 ? "up" : "down";
  if (previous === 0) return { direction, text: t.none[kind](ref) };
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  if (pct === 0) return { direction, text: t.almostSame(ref) };
  const share = formatPercent(percents[locale].format(pct), locale);
  // Stryker disable next-line EqualityOperator: ídem
  return { direction, text: diff > 0 ? t.more(share, ref) : t.less(share, ref) };
}
