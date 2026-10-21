import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { formatMonthName, type Month, monthOf } from "@/lib/dates";
import { formatPercent, roundToCents, sumAmounts } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";

// El historial del valor de cada gasto fijo (Reportes): sale de los movimientos. Cada mes en que el
// total de esa descripción es distinto al del mes anterior en que apareció es un cambio, con el valor
// anterior y el nuevo, la diferencia en plata y en porcentaje, y la fecha del primer pago de ese mes.
// El primer mes es el punto de partida.

/** El largo máximo de una nota (el mismo límite que pone la base: FIXED_NOTE_MAX_LENGTH). */
export const NOTE_MAX_LENGTH = 280;

/** Lo que sumó una descripción en un mes ("YYYY-MM"), como lo da la base. */
export type HistoryMonth = {
  month: string;
  description: string;
  total: number;
  /** El primer pago de ese mes (YYYY-MM-DD). */
  first: string;
};

export type HistoryEntry = {
  month: string;
  /** El primer pago con el valor nuevo (YYYY-MM-DD). */
  date: string;
  /** El valor nuevo: lo que sumó ese mes. */
  amount: number;
  /** El valor anterior; null en el primer pago. */
  previous: number | null;
  /** La diferencia (nuevo − anterior), en centavos exactos; null en el primer pago. */
  diff: number | null;
  /** La diferencia en porcentaje, redondeada (negativa si bajó); null en el primer pago. */
  pct: number | null;
};

/**
 * El historial de cada gasto de `keys` (las claves de `searchKey`), del cambio más reciente al primer
 * pago. Las descripciones que solo cambian en mayúsculas, tildes o espacios son el mismo gasto: en un
 * mismo mes se suman, y vale el primer pago de todas.
 */
export function fixedHistories(rows: HistoryMonth[], keys: Iterable<string>): Map<string, HistoryEntry[]> {
  const wanted = new Set(keys);
  const months = new Map<string, Map<string, { total: number; first: string }>>();
  for (const row of rows) {
    const key = searchKey(row.description);
    if (!wanted.has(key)) continue;
    const byMonth = months.get(key) ?? new Map<string, { total: number; first: string }>();
    const seen = byMonth.get(row.month);
    byMonth.set(row.month, {
      total: sumAmounts([seen?.total ?? 0, row.total]),
      // Stryker disable next-line EqualityOperator: con las dos fechas iguales, da lo mismo cuál se toma
      first: seen && seen.first < row.first ? seen.first : row.first,
    });
    months.set(key, byMonth);
  }

  const histories = new Map<string, HistoryEntry[]>();
  for (const [key, byMonth] of months) {
    const entries: HistoryEntry[] = [];
    let previous: number | null = null;
    // "YYYY-MM" se ordena como texto.
    for (const [month, { total, first }] of [...byMonth].sort(([a], [b]) => a.localeCompare(b))) {
      if (previous === null) {
        entries.push({ month, date: first, amount: total, previous: null, diff: null, pct: null });
      } else if (total !== previous) {
        const diff = roundToCents(total - previous);
        entries.push({ month, date: first, amount: total, previous, diff, pct: Math.round((diff / previous) * 100) });
      }
      previous = total;
    }
    histories.set(key, entries.reverse());
  }
  return histories;
}

/** El porcentaje de un cambio para mostrar, sin signo: "11 %", o "<1 %" si cambió poco (redondeado da 0). */
export const pctLabel = (pct: number, locale: Locale = DEFAULT_LOCALE) => formatPercent(pct === 0 ? "<1" : Math.abs(pct), locale);

/** Si subió o bajó (un cambio siempre es distinto de cero, aunque el porcentaje redondeado lo sea). */
// Stryker disable next-line EqualityOperator: un cambio nunca es cero (fixedHistories solo registra los meses en que el total cambió)
export const changeDirection = (diff: number): "up" | "down" => (diff > 0 ? "up" : "down");

/** Un cambio del historial con la nota de la persona (o null). */
export type FixedHistoryEntry = HistoryEntry & { note: string | null };

/** El cambio más reciente (no el primer pago); null si el valor nunca cambió. */
export const lastChange = (entries: HistoryEntry[]) => entries.find((entry) => entry.previous !== null) ?? null;


/**
 * El último cambio en una línea, con su dirección: "11% desde marzo" (con el año si no es el de
 * `current`: "11% desde marzo de 2025"; en inglés, "11% since March"); null si el valor nunca cambió.
 */
export function lastChangeSummary(
  entries: HistoryEntry[],
  current: Month,
  locale: Locale = DEFAULT_LOCALE,
): { direction: "up" | "down"; text: string } | null {
  const change = lastChange(entries);
  if (!change) return null;
  const month = monthOf(`${change.month}-01`);
  const since = formatMonthName(month, { withYear: month.year !== current.year, locale });
  return {
    direction: changeDirection(change.diff!),
    text: `${pctLabel(change.pct!, locale)} ${locale === "es" ? "desde" : "since"} ${since}`,
  };
}
