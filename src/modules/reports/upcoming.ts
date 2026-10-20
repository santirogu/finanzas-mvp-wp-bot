import { formatMonthName, formatShortDate, monthOf, monthParam, shiftMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";
import type { HistoryMonth } from "./history";
import type { FixedOption } from "./recurring";

// Los avisos de próximos pagos (Resumen): para cada gasto fijo, la fecha en que se espera el pago de cada
// mes y si ya se pagó. La fecha sale del día del mes en que se pagó las últimas veces (la mediana de los
// últimos PAYMENTS_FOR_DAY pagos: resiste un pago fuera de lo normal). Se avisa de los que tocan en los
// próximos días (los que elija la persona; si no, DAYS_AHEAD) y de los atrasados (sin pago) de hasta
// MONTHS_BACK meses atrás, salvo que la persona haya marcado "Este pago ya no aplica" (solo para ese mes:
// fixed_payment_skip).

/** Cuántos pagos se miran para saber qué día del mes se paga. Con menos, la fecha es aproximada. */
export const PAYMENTS_FOR_DAY = 3;

/** Con cuántos días de anticipación se avisa si la persona no lo cambió (Mi cuenta → Notificaciones). */
export const DAYS_AHEAD = 3;

/** Lo más que se puede pedir (el mismo límite que pone la base: UPCOMING_DAYS_MAX); 0 es el mismo día. */
export const MAX_DAYS_AHEAD = 10;

/** El error del campo de los días de anticipación (en el navegador y en el servidor). */
export const DAYS_AHEAD_MESSAGE = `Escribe un número entre 0 y ${MAX_DAYS_AHEAD}.`;

/** Hasta cuántos meses atrás se sigue avisando de un pago atrasado. */
export const MONTHS_BACK = 3;

/** Un pago que no se registró a más de medio mes de su fecha es de otro mes. */
const HALF_MONTH = 15;

export type UpcomingPayment = {
  key: string;
  description: string;
  emoji: string;
  /** Lo que se espera pagar: lo del último mes en que apareció. */
  amount: number;
  /** El mes del pago ("YYYY-MM"): el que oculta "Este pago ya no aplica". */
  month: string;
  /** La fecha esperada (YYYY-MM-DD). */
  date: string;
  /** Días desde hoy hasta la fecha: negativo si está atrasado, 0 si es hoy. */
  days: number;
  /** El día del mes en que se suele pagar. */
  usualDay: number;
  /** Con menos de PAYMENTS_FOR_DAY pagos: la fecha es aproximada. */
  approximate: boolean;
};

const DAY_MS = 86_400_000;
const toTime = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
/** Días de `from` a `to` (las dos YYYY-MM-DD). */
export const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY_MS);

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** La fecha de un mes con ese día; si el mes es más corto (un 31 en noviembre o en febrero), su último día. */
export function dateInMonth(month: string, day: number): string {
  const { year, month: m } = monthOf(`${month}-01`);
  return `${month}-${String(Math.min(day, daysInMonth(year, m))).padStart(2, "0")}`;
}

/**
 * El día del mes en que se suele pagar: la mediana de los días de los pagos (con dos, el promedio). Los
 * pagos alrededor del cambio de mes (el 30, el 31, el 1) cuentan juntos: un 1 se toma como un 32.
 */
export function usualDay(dates: string[]): number {
  let days = dates.map((date) => Number(date.slice(8, 10)));
  if (Math.max(...days) - Math.min(...days) > HALF_MONTH) days = days.map((day) => (day <= HALF_MONTH ? day + 31 : day));
  const sorted = [...days].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  return median > 31 ? median - 31 : median;
}

/** Los pagos de cada gasto, por clave: la fecha del primero de cada mes, del más antiguo al más reciente. */
function paymentsByKey(rows: HistoryMonth[], keys: Set<string>): Map<string, string[]> {
  const byKey = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const key = searchKey(row.description);
    if (!keys.has(key)) continue;
    const months = byKey.get(key) ?? new Map<string, string>();
    const seen = months.get(row.month);
    months.set(row.month, seen && seen < row.first ? seen : row.first);
    byKey.set(key, months);
  }
  return new Map([...byKey].map(([key, months]) => [key, [...months.values()].sort()]));
}

/**
 * Los pagos de los gastos fijos (`items`) que hay que avisar hoy (`today`, YYYY-MM-DD en la zona de la
 * persona), de la fecha más vieja a la más próxima. `history` son los egresos por mes y descripción (de
 * todo el tiempo), `skipped`, los pagos marcados "ya no aplica" ("<clave> YYYY-MM"), y `daysAhead`, con
 * cuántos días de anticipación se avisa (0: el mismo día).
 */
export function upcomingPayments(
  items: (FixedOption & { amount: number })[],
  history: HistoryMonth[],
  skipped: ReadonlySet<string>,
  today: string,
  daysAhead: number = DAYS_AHEAD,
): UpcomingPayment[] {
  const payments = paymentsByKey(history, new Set(items.map((item) => item.key)));
  const current = monthOf(today);
  const oldest = monthParam(shiftMonth(current, -MONTHS_BACK));
  const result: UpcomingPayment[] = [];
  for (const item of items) {
    const dates = payments.get(item.key);
    if (!dates) continue;
    const recent = dates.slice(-PAYMENTS_FOR_DAY);
    const day = usualDay(recent);
    // Un pago por mes, desde el que corresponde al primer pago (si se pagó el 25 lo que se suele pagar el
    // 5, es el del mes siguiente) hasta el del mes siguiente al actual (a fin de mes, el del 1 ya puede
    // estar a menos de los días de anticipación; con 10, el del 5 también).
    const due: { month: string; date: string; paid: boolean }[] = [];
    for (let month = shiftMonth(monthOf(dates[0]), -1); monthParam(month) <= monthParam(shiftMonth(current, 1)); month = shiftMonth(month, 1)) {
      const date = dateInMonth(monthParam(month), day);
      if (daysBetween(dates[0], date) >= -HALF_MONTH) due.push({ month: monthParam(month), date, paid: false });
    }
    // Cada pago cuenta para la fecha esperada más cercana (pagar el 2 de noviembre lo de octubre, si se
    // suele pagar el 30, cuenta para octubre).
    for (const paid of dates) {
      const nearest = due.reduce((best, d) => (Math.abs(daysBetween(paid, d.date)) < Math.abs(daysBetween(paid, best.date)) ? d : best));
      if (Math.abs(daysBetween(paid, nearest.date)) <= HALF_MONTH) nearest.paid = true;
    }
    for (const d of due) {
      const days = daysBetween(today, d.date);
      if (d.paid || days > daysAhead || d.month < oldest || skipped.has(`${item.key} ${d.month}`)) continue;
      result.push({
        key: item.key,
        description: item.description,
        emoji: item.emoji,
        amount: item.amount,
        month: d.month,
        date: d.date,
        days,
        usualDay: day,
        approximate: recent.length < PAYMENTS_FOR_DAY,
      });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
}

/** Los días que mira la tarjeta, para su texto: "de hoy", "de hoy y mañana" o "de los próximos 3 días". */
export function windowPhrase(daysAhead: number): string {
  if (daysAhead === 0) return "de hoy";
  if (daysAhead === 1) return "de hoy y mañana";
  return `de los próximos ${daysAhead} días`;
}

/** Con cuánta anticipación, para el aviso al guardar: "el mismo día", "1 día antes" o "5 días antes". */
export function daysAheadPhrase(daysAhead: number): string {
  if (daysAhead === 0) return "el mismo día";
  return `${daysAhead} ${daysAhead === 1 ? "día" : "días"} antes`;
}

/** Cuándo, en palabras: "Atrasado", "Hoy", "Mañana" o "En 3 días". */
export function whenLabel(days: number): string {
  if (days < 0) return "Atrasado";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

/** La fecha y de dónde sale: "5 de oct · lo sueles pagar el 5" (con "aprox." si son pocos pagos; con el año si no es el actual). */
export function dateLine(payment: UpcomingPayment, today: string): string {
  const date = formatShortDate(payment.date, { withYear: payment.date.slice(0, 4) !== today.slice(0, 4) });
  return `${date} · lo sueles pagar el ${payment.usualDay}${payment.approximate ? " (aprox.)" : ""}`;
}

/** Un aviso, con sus textos ya armados (para el Resumen y la campana). */
export type UpcomingItem = {
  /** "<clave> YYYY-MM": único entre los avisos. */
  id: string;
  description: string;
  emoji: string;
  /** El mes del pago ("YYYY-MM"): el que oculta "ya no aplica". */
  month: string;
  /** "octubre" (con el año si no es el actual): para el nombre del botón. */
  monthName: string;
  /** "≈ −$1.800.000,00". */
  amount: string;
  /** "Atrasado", "Hoy", "Mañana" o "En 3 días". */
  when: string;
  /** "5 de oct · lo sueles pagar el 5 (aprox.)". */
  dateLine: string;
  overdue: boolean;
};

/** Los avisos con sus textos: los nombres de los meses salen de Intl, en el servidor. */
export function upcomingItems(payments: UpcomingPayment[], today: string, currency: string): UpcomingItem[] {
  return payments.map((payment) => ({
    id: `${payment.key} ${payment.month}`,
    description: payment.description,
    emoji: payment.emoji,
    month: payment.month,
    monthName: formatMonthName(monthOf(`${payment.month}-01`), { withYear: payment.month.slice(0, 4) !== today.slice(0, 4) }),
    amount: `≈ −${formatMoney(payment.amount, currency)}`,
    when: whenLabel(payment.days),
    dateLine: dateLine(payment, today),
    overdue: payment.days < 0,
  }));
}
