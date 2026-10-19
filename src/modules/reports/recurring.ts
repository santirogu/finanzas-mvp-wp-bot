import { compareMonths, type Month, monthParam, shiftMonth } from "@/lib/dates";
import { sumAmounts } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";

// "Gastos fijos" de Reportes: los egresos que se repiten cada mes con la misma descripción (el
// arriendo, Netflix, el plan del celular), detectados solos.

/** Los meses que se miran para decidir si un gasto es fijo: los últimos del período. */
export const RECURRING_WINDOW = 4;
/** En cuántos de esos meses tiene que aparecer, como mínimo. */
export const RECURRING_MIN_MONTHS = 3;
/**
 * Cuántas veces puede aparecer en un mismo mes. Un gasto fijo se paga una vez al mes (dos, si es
 * quincenal o son dos suscripciones con el mismo nombre); "Almuerzo" o "Taxi", que se repiten muchas
 * veces, no son fijos aunque estén todos los meses.
 */
export const RECURRING_MAX_PER_MONTH = 2;

/** Los egresos de un mes ("YYYY-MM") con una misma descripción, como los da la base. */
export type DescriptionMonthTotal = {
  month: string;
  /** La descripción como se escribió la última vez en ese mes. */
  description: string;
  emoji: string;
  /** Cuántos egresos la usaron en ese mes. */
  count: number;
  total: number;
  /** La fecha del último (YYYY-MM-DD). */
  latest: string;
};

export type RecurringExpense = {
  /** Como se escribió la última vez. */
  description: string;
  emoji: string;
  /** Lo que sumó el último mes de la ventana en que apareció: lo que cuesta al mes. */
  amount: number;
  /** En cuántos meses del período aparece. */
  months: number;
};

export type RecurringReport = {
  items: RecurringExpense[];
  /** Lo que suman al mes. */
  total: number;
};

/** El primer mes que hay que consultar para el período: el suyo o, si es más corto, el de la ventana. */
export function recurringFrom(period: Month[]): Month {
  const windowStart = shiftMonth(period[period.length - 1], -(RECURRING_WINDOW - 1));
  return compareMonths(windowStart, period[0]) < 0 ? windowStart : period[0];
}

/**
 * Los gastos fijos al final del período, del más caro al más barato. `rows` trae los egresos por mes
 * y descripción del período y de la ventana (desde `recurringFrom`). "Arriendo" y "arriendo " son la
 * misma descripción, y también "Cívica" y "Civica": no importan mayúsculas, tildes ni espacios.
 */
export function recurringExpenses(rows: DescriptionMonthTotal[], period: Month[]): RecurringReport {
  const window = new Set(
    Array.from({ length: RECURRING_WINDOW }, (_, i) => monthParam(shiftMonth(period[period.length - 1], i - RECURRING_WINDOW + 1))),
  );
  const inPeriod = new Set(period.map(monthParam));

  // Por descripción y, dentro de cada una, por mes (juntando las que solo cambian en tildes o mayúsculas).
  const byDescription = new Map<string, Map<string, DescriptionMonthTotal>>();
  for (const row of rows) {
    const months = byDescription.get(searchKey(row.description)) ?? new Map<string, DescriptionMonthTotal>();
    const seen = months.get(row.month);
    months.set(
      row.month,
      seen
        ? {
            ...(row.latest > seen.latest ? row : seen),
            count: seen.count + row.count,
            total: sumAmounts([seen.total, row.total]),
          }
        : row,
    );
    byDescription.set(searchKey(row.description), months);
  }

  const items: RecurringExpense[] = [];
  for (const months of byDescription.values()) {
    const inWindow = [...months.values()].filter((row) => window.has(row.month));
    if (inWindow.length < RECURRING_MIN_MONTHS || inWindow.some((row) => row.count > RECURRING_MAX_PER_MONTH)) continue;
    // "YYYY-MM" se ordena como texto.
    const last = inWindow.reduce((a, b) => (b.month > a.month ? b : a));
    items.push({
      description: last.description,
      emoji: last.emoji,
      amount: last.total,
      months: [...months.keys()].filter((month) => inPeriod.has(month)).length,
    });
  }
  items.sort((a, b) => b.amount - a.amount || a.description.localeCompare(b.description, "es"));
  return { items, total: sumAmounts(items.map((item) => item.amount)) };
}
