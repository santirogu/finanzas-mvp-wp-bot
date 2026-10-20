import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { formatMoney, roundToCents } from "@/lib/money";

/** Cómo le fue a un total frente al mes anterior: la flecha que lo acompaña y la frase. */
export type MonthChange = { direction: "up" | "down" | "same"; text: string };

const TEXTS = texts(
  {
    same: (month: string) => `Igual que ${month}`,
    almostSame: (month: string) => `Casi igual que ${month}`,
    more: (amount: string, month: string) => `${amount} más que ${month}`,
    less: (amount: string, month: string) => `${amount} menos que ${month}`,
    none: { income: (month: string) => `Sin ingresos en ${month}`, expense: (month: string) => `Sin egresos en ${month}` },
  },
  {
    en: {
      same: (month) => `Same as ${month}`,
      almostSame: (month) => `Almost the same as ${month}`,
      more: (amount, month) => `${amount} more than ${month}`,
      less: (amount, month) => `${amount} less than ${month}`,
      none: { income: (month) => `No income in ${month}`, expense: (month) => `No expenses in ${month}` },
    },
  },
);

// El porcentaje ya llega redondeado: el formato solo le pone el separador de los miles.
const percents: Readonly<Record<Locale, Intl.NumberFormat>> = {
  es: new Intl.NumberFormat(INTL_LOCALES.es),
  en: new Intl.NumberFormat(INTL_LOCALES.en),
};

/** El balance frente al del mes anterior, en plata: "$120.000,00 más que agosto" (`previousMonth`, en el idioma). */
export function balanceChange(current: number, previous: number, previousMonth: string, currency?: string, locale: Locale = DEFAULT_LOCALE): MonthChange {
  const t = TEXTS[locale];
  const diff = roundToCents(current - previous);
  if (diff === 0) return { direction: "same", text: t.same(previousMonth) };
  const amount = formatMoney(Math.abs(diff), currency, locale);
  return {
    // Stryker disable next-line EqualityOperator: una diferencia de 0 ya volvió arriba ("Igual que…")
    direction: diff > 0 ? "up" : "down",
    // Stryker disable next-line EqualityOperator: ídem
    text: diff > 0 ? t.more(amount, previousMonth) : t.less(amount, previousMonth),
  };
}

/**
 * Los ingresos o los egresos frente a los del mes anterior, en porcentaje: "15% más que agosto". Si el
 * mes anterior no tuvo (`previous` en cero), no hay porcentaje que dar: "Sin egresos en agosto".
 */
export function totalChange(
  current: number,
  previous: number,
  previousMonth: string,
  kind: "income" | "expense",
  locale: Locale = DEFAULT_LOCALE,
): MonthChange {
  const t = TEXTS[locale];
  const diff = roundToCents(current - previous);
  if (diff === 0) return { direction: "same", text: t.same(previousMonth) };
  // Stryker disable next-line EqualityOperator: ídem
  const direction = diff > 0 ? "up" : "down";
  if (previous === 0) return { direction, text: t.none[kind](previousMonth) };
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  if (pct === 0) return { direction, text: t.almostSame(previousMonth) };
  const share = `${percents[locale].format(pct)}%`;
  // Stryker disable next-line EqualityOperator: ídem
  return { direction, text: diff > 0 ? t.more(share, previousMonth) : t.less(share, previousMonth) };
}
