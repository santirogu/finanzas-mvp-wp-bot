import { compareMonths, type Month, monthParam } from "@/lib/dates";
import { formatShare, roundToCents, sumAmounts } from "@/lib/money";

// El resumen de un período en Reportes: los totales de cada mes (las barras) y los del período (las
// tarjetas de arriba).

/** Lo que suma cada mes con movimientos ("YYYY-MM"), como lo da la base. */
export type MonthTotals = { month: string; income: number; expense: number };

/** Un mes del período, con lo que sumó (cero si no tuvo movimientos). */
export type MonthPoint = { month: Month; income: number; expense: number; balance: number };

/** Los meses del período con sus totales, en orden: también los que no tuvieron movimientos. */
export function monthSeries(months: Month[], totals: MonthTotals[]): MonthPoint[] {
  const byMonth = new Map(totals.map((row) => [row.month, row]));
  return months.map((month) => {
    const row = byMonth.get(monthParam(month));
    const income = row?.income ?? 0;
    const expense = row?.expense ?? 0;
    return { month, income, expense, balance: roundToCents(income - expense) };
  });
}

export type PeriodSummary = {
  income: number;
  expense: number;
  balance: number;
  /**
   * Qué parte de los ingresos quedó: "28" (el porcentaje, para "Ahorraste el 28% de tus ingresos").
   * "overspent" si gastó más de lo que ganó; null si el balance es cero o no hubo ingresos.
   */
  saved: string | "overspent" | null;
  /**
   * El gasto promedio por mes. Solo con los meses completos (el actual va en curso: bajaría el
   * promedio) y desde el primero en que la persona registró algo (antes no usaba la app). null si no
   * hay ninguno.
   */
  averageExpense: { amount: number; months: number; withoutCurrent: boolean } | null;
  /** El mes en que más gastó (si empatan, el más reciente); null si no hubo egresos. */
  topMonth: { month: Month; expense: number } | null;
};

/**
 * Las cifras del período. `firstActive` es el primer mes en que la persona tiene movimientos (en
 * cualquier período); null si no tiene ninguno.
 */
export function periodSummary(series: MonthPoint[], current: Month, firstActive: Month | null): PeriodSummary {
  const income = sumAmounts(series.map((point) => point.income));
  const expense = sumAmounts(series.map((point) => point.expense));
  const balance = roundToCents(income - expense);

  let saved: PeriodSummary["saved"] = null;
  if (balance < 0) saved = "overspent";
  else if (balance > 0) saved = formatShare(balance, income);

  const complete = series.filter(
    (point) => compareMonths(point.month, current) < 0 && firstActive !== null && compareMonths(point.month, firstActive) >= 0,
  );
  const averageExpense =
    complete.length === 0
      ? null
      : {
          amount: roundToCents(sumAmounts(complete.map((point) => point.expense)) / complete.length),
          months: complete.length,
          withoutCurrent: series.some((point) => compareMonths(point.month, current) === 0),
        };

  let topMonth: PeriodSummary["topMonth"] = null;
  for (const point of series) {
    if (point.expense > 0 && point.expense >= (topMonth?.expense ?? 0)) topMonth = { month: point.month, expense: point.expense };
  }

  return { income, expense, balance, saved, averageExpense, topMonth };
}
