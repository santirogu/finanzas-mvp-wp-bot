import { compareMonths, type Month, monthParam, shiftMonth } from "@/lib/dates";
import { sumAmounts } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";

// Los gastos fijos (la pestaña Fijos; Reportes los descuenta de los gastos más grandes y del gasto por
// día): los egresos que se repiten cada mes con la misma descripción (el arriendo, Netflix, el plan del
// celular), detectados solos. La persona puede quitar uno que se detectó
// por error o agregar uno que todavía lleva pocos meses (fixed_expense_choice).

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

/** Lo que marcó la persona a mano, por clave (`searchKey` de la descripción): lo que agregó y lo que quitó. */
export type FixedChoices = { include: ReadonlySet<string>; exclude: ReadonlySet<string> };

export const NO_CHOICES: FixedChoices = { include: new Set(), exclude: new Set() };

/** Un egreso que se puede agregar o volver a poner: con su descripción como se escribió la última vez. */
export type FixedOption = { key: string; description: string; emoji: string };

export type RecurringExpense = FixedOption & {
  /**
   * Lo que cuesta al mes: lo que sumó el último mes en que apareció (de la ventana, si lo detectó solo;
   * del período, si lo agregó la persona).
   */
  amount: number;
  /** En cuántos meses del período aparece. */
  months: number;
  /** "auto": lo detectó solo; "manual": lo agregó la persona. */
  origin: "auto" | "manual";
};

export type RecurringReport = {
  items: RecurringExpense[];
  /** Lo que suman al mes. */
  total: number;
  /** Los que se detectaron pero la persona quitó: se pueden volver a poner. */
  removed: FixedOption[];
  /** Los demás egresos del período, que se pueden agregar a mano. */
  candidates: FixedOption[];
};

/** El primer mes que hay que consultar para el período: el suyo o, si es más corto, el de la ventana. */
export function recurringFrom(period: Month[]): Month {
  const windowStart = shiftMonth(period[period.length - 1], -(RECURRING_WINDOW - 1));
  // Stryker disable next-line EqualityOperator: si son el mismo mes, cualquiera de los dos da lo mismo
  return compareMonths(windowStart, period[0]) < 0 ? windowStart : period[0];
}

/** El de un mes más reciente ("YYYY-MM" se ordena como texto). */
// Stryker disable next-line EqualityOperator: los meses de una descripción no se repiten (nunca son iguales)
const latestOf = (rows: DescriptionMonthTotal[]) => rows.reduce((a, b) => (b.month > a.month ? b : a));

const byDescription = (a: FixedOption, b: FixedOption) => a.description.localeCompare(b.description, "es");

/**
 * Los gastos fijos al final del período, del más caro al más barato. `rows` trae los egresos por mes
 * y descripción del período y de la ventana (desde `recurringFrom`). "Arriendo" y "arriendo " son la
 * misma descripción, y también "Cívica" y "Civica": no importan mayúsculas, tildes ni espacios.
 *
 * Con `choices`, lo que marcó la persona: uno detectado que quitó pasa a `removed`; uno que agregó
 * aparece aunque no se detecte (si tiene egresos en el período). Los demás egresos del período quedan
 * en `candidates`, para agregarlos.
 */
export function recurringExpenses(rows: DescriptionMonthTotal[], period: Month[], choices: FixedChoices = NO_CHOICES): RecurringReport {
  const window = new Set(
    Array.from({ length: RECURRING_WINDOW }, (_, i) => monthParam(shiftMonth(period[period.length - 1], i - RECURRING_WINDOW + 1))),
  );
  const inPeriod = new Set(period.map(monthParam));

  // Por descripción y, dentro de cada una, por mes (juntando las que solo cambian en tildes o mayúsculas).
  const descriptions = new Map<string, Map<string, DescriptionMonthTotal>>();
  for (const row of rows) {
    const months = descriptions.get(searchKey(row.description)) ?? new Map<string, DescriptionMonthTotal>();
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
    descriptions.set(searchKey(row.description), months);
  }

  const items: RecurringExpense[] = [];
  const removed: FixedOption[] = [];
  const candidates: FixedOption[] = [];
  for (const [key, months] of descriptions) {
    const inWindow = [...months.values()].filter((row) => window.has(row.month));
    const ofPeriod = [...months.values()].filter((row) => inPeriod.has(row.month));
    const detected = inWindow.length >= RECURRING_MIN_MONTHS && inWindow.every((row) => row.count <= RECURRING_MAX_PER_MONTH);
    if (detected) {
      const last = latestOf(inWindow);
      const option = { key, description: last.description, emoji: last.emoji };
      if (choices.exclude.has(key)) removed.push(option);
      else items.push({ ...option, amount: last.total, months: ofPeriod.length, origin: "auto" });
      continue;
    }
    // Solo de la ventana (antes de un período corto): no se ofrece.
    if (ofPeriod.length === 0) continue;
    const last = latestOf(ofPeriod);
    const option = { key, description: last.description, emoji: last.emoji };
    if (choices.include.has(key)) items.push({ ...option, amount: last.total, months: ofPeriod.length, origin: "manual" });
    else candidates.push(option);
  }
  items.sort((a, b) => b.amount - a.amount || byDescription(a, b));
  return {
    items,
    total: sumAmounts(items.map((item) => item.amount)),
    removed: removed.sort(byDescription),
    candidates: candidates.sort(byDescription),
  };
}
