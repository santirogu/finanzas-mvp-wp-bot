import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { compareMonths, FIRST_MONTH, formatMonthLabel, formatMonthName, type Month, monthParam, shiftMonth } from "@/lib/dates";

const TEXTS = texts(
  { last12: "Últimos 12 meses", range: (from: string, to: string) => `De ${from} a ${to}`, fileTo: "a" },
  { en: { last12: "Last 12 months", range: (from, to) => `${from} to ${to}`, fileTo: "to" } },
);

// El período de Reportes va en la URL (`/reportes?periodo=2025`): así funcionan el botón de atrás y los
// enlaces. Sin `?periodo=` (o con uno inválido o futuro), los últimos 12 meses, contando el actual.

/** El `?periodo=` de los últimos 12 meses (también el que se ve sin parámetro). */
export const LAST_12_MONTHS = "12-meses";

export type ReportPeriod = {
  /** El valor de `?periodo=`: "12-meses" o un año ("2025"). */
  id: string;
  /** El chip que lo elige: "Últimos 12 meses" o "2025". */
  label: string;
  /** Los meses que abarca, en una frase: "De noviembre de 2025 a octubre de 2026". */
  range: string;
  /** Sus meses, del más antiguo al más reciente, sin los futuros. */
  months: Month[];
};

/** Los meses de `first` a `last`, los dos incluidos. */
function monthsBetween(first: Month, last: Month): Month[] {
  const count = compareMonths(last, first) + 1;
  return Array.from({ length: count }, (_, i) => shiftMonth(first, i));
}

/**
 * "De enero a octubre de 2026", "De noviembre de 2025 a octubre de 2026" o, si es uno solo, "Enero de 2026".
 * En inglés, "January to October 2026".
 */
export function rangePhrase(months: Month[], locale: Locale = DEFAULT_LOCALE): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (months.length === 1) return formatMonthLabel(first, locale);
  const from = formatMonthName(first, { withYear: first.year !== last.year, locale });
  return TEXTS[locale].range(from, formatMonthName(last, { withYear: true, locale }));
}

/** El año que pide `?periodo=`, si es uno que se puede ver (de FIRST_MONTH al actual); si no, null. */
function parseYear(param: unknown, current: Month): number | null {
  if (typeof param !== "string" || !/^\d{4}$/.test(param)) return null;
  const year = Number(param);
  return year >= FIRST_MONTH.year && year <= current.year ? year : null;
}

/** El período que pide la URL. Un año en curso llega hasta el mes actual (no hay movimientos futuros). */
export function reportPeriod(param: unknown, current: Month, locale: Locale = DEFAULT_LOCALE): ReportPeriod {
  const year = parseYear(param, current);
  if (year === null) {
    const months = monthsBetween(shiftMonth(current, -11), current);
    return { id: LAST_12_MONTHS, label: TEXTS[locale].last12, range: rangePhrase(months, locale), months };
  }
  const last = year === current.year ? current : { year, month: 12 };
  const months = monthsBetween({ year, month: 1 }, last);
  return { id: String(year), label: String(year), range: rangePhrase(months, locale), months };
}

/**
 * La dirección de Reportes en un período (o, con `path`, la de su descarga): sin `?periodo=` para los
 * últimos 12 meses.
 */
export function periodHref(id: string, path = "/reportes"): string {
  return id === LAST_12_MONTHS ? path : `${path}?periodo=${id}`;
}

export type PeriodOption = { id: string; label: string; href: string; selected: boolean };

/**
 * Los chips para elegir el período: los últimos 12 meses y, del más reciente al más antiguo, cada año
 * con movimientos (`activeMonths`, "YYYY-MM"). El año elegido aparece aunque no tenga movimientos
 * (se llegó a él por la URL): así se ve cuál es.
 */
export function periodOptions(selected: ReportPeriod, activeMonths: string[], locale: Locale = DEFAULT_LOCALE): PeriodOption[] {
  const years = new Set(activeMonths.map((month) => month.slice(0, 4)));
  if (selected.id !== LAST_12_MONTHS) years.add(selected.id);
  const ids = [LAST_12_MONTHS, ...[...years].sort().reverse()];
  return ids.map((id) => ({
    id,
    label: id === LAST_12_MONTHS ? TEXTS[locale].last12 : id,
    href: periodHref(id),
    selected: id === selected.id,
  }));
}

/**
 * El nombre de un archivo del período: "movimientos-2025.csv" o, los últimos 12 meses,
 * "movimientos-2025-11-a-2026-10.csv" (en inglés, "-to-": el prefijo lo da quien lo usa, en su idioma).
 */
export function periodFileName(prefix: string, period: ReportPeriod, extension: string, locale: Locale = DEFAULT_LOCALE): string {
  if (period.id !== LAST_12_MONTHS) return `${prefix}-${period.id}.${extension}`;
  return `${prefix}-${monthParam(period.months[0])}-${TEXTS[locale].fileTo}-${monthParam(period.months[period.months.length - 1])}.${extension}`;
}
