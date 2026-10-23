import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { formatMonthName, formatShortDate, monthOf, monthParam, shiftMonth } from "@/lib/dates";
import { amountInputValue, formatMoney } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";
import { NO_CATEGORIES } from "@/modules/transactions/search";
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

/** El error del campo de los días de anticipación (en el navegador y en el servidor), en cada idioma. */
export const DAYS_AHEAD_MESSAGES: Readonly<Record<Locale, string>> = {
  es: `Escribe un número entre 0 y ${MAX_DAYS_AHEAD}.`,
  en: `Enter a number between 0 and ${MAX_DAYS_AHEAD}.`,
};

/** En español (el de siempre). */
export const DAYS_AHEAD_MESSAGE = DAYS_AHEAD_MESSAGES.es;

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

/** Lo que se espera de un gasto fijo: el día en que se suele pagar y cada pago esperado, con la fecha en que se pagó. */
export type PaymentSchedule = {
  /** El día del mes en que se suele pagar. */
  day: number;
  /** Con menos de PAYMENTS_FOR_DAY pagos: el día es aproximado. */
  approximate: boolean;
  /** Un pago por mes ("YYYY-MM"), con su fecha esperada y la del pago que contó para él (null si falta). */
  due: { month: string; date: string; paidOn: string | null }[];
};

/**
 * El calendario de pagos de cada gasto fijo (`items`), por su clave, a partir de los egresos por mes y descripción
 * (`history`): desde el mes que corresponde a su primer pago hasta el siguiente al de `today` (YYYY-MM-DD). Sin
 * pagos, el gasto no está. Lo comparten los avisos de próximos pagos y el estado del mes de Fijos.
 */
export function paymentSchedules(items: readonly Pick<FixedOption, "key">[], history: HistoryMonth[], today: string): Map<string, PaymentSchedule> {
  const payments = paymentsByKey(history, new Set(items.map((item) => item.key)));
  const current = monthOf(today);
  const schedules = new Map<string, PaymentSchedule>();
  for (const item of items) {
    const dates = payments.get(item.key);
    if (!dates) continue;
    const recent = dates.slice(-PAYMENTS_FOR_DAY);
    const day = usualDay(recent);
    // Un pago por mes, desde el que corresponde al primer pago (si se pagó el 25 lo que se suele pagar el
    // 5, es el del mes siguiente) hasta el del mes siguiente al actual (a fin de mes, el del 1 ya puede
    // estar a menos de los días de anticipación; con 10, el del 5 también).
    const due: PaymentSchedule["due"] = [];
    for (let month = shiftMonth(monthOf(dates[0]), -1); monthParam(month) <= monthParam(shiftMonth(current, 1)); month = shiftMonth(month, 1)) {
      const date = dateInMonth(monthParam(month), day);
      if (daysBetween(dates[0], date) >= -HALF_MONTH) due.push({ month: monthParam(month), date, paidOn: null });
    }
    // Cada pago cuenta para la fecha esperada más cercana (pagar el 2 de noviembre lo de octubre, si se
    // suele pagar el 30, cuenta para octubre). Los pagos van del más viejo al más nuevo: queda el primero.
    for (const paid of dates) {
      const nearest = due.reduce((best, d) => (Math.abs(daysBetween(paid, d.date)) < Math.abs(daysBetween(paid, best.date)) ? d : best));
      if (Math.abs(daysBetween(paid, nearest.date)) <= HALF_MONTH) nearest.paidOn ??= paid;
    }
    schedules.set(item.key, { day, approximate: recent.length < PAYMENTS_FOR_DAY, due });
  }
  return schedules;
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
  const schedules = paymentSchedules(items, history, today);
  const oldest = monthParam(shiftMonth(monthOf(today), -MONTHS_BACK));
  const result: UpcomingPayment[] = [];
  for (const item of items) {
    const schedule = schedules.get(item.key);
    if (!schedule) continue;
    for (const d of schedule.due) {
      const days = daysBetween(today, d.date);
      if (d.paidOn || days > daysAhead || d.month < oldest || skipped.has(`${item.key} ${d.month}`)) continue;
      result.push({
        key: item.key,
        description: item.description,
        emoji: item.emoji,
        amount: item.amount,
        month: d.month,
        date: d.date,
        days,
        usualDay: schedule.day,
        approximate: schedule.approximate,
      });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
}

const TEXTS = texts(
  {
    window: { today: "de hoy", tomorrow: "de hoy y mañana", days: (n: number) => `de los próximos ${n} días` },
    ahead: { sameDay: "el mismo día", days: (n: number) => `${n} ${n === 1 ? "día" : "días"} antes` },
    when: { overdue: "Atrasado", today: "Hoy", tomorrow: "Mañana", days: (n: number) => `En ${n} días` },
    usually: (day: number) => `lo sueles pagar el ${day}`,
    approximate: " (aprox.)",
  },
  {
    en: {
      window: { today: "for today", tomorrow: "for today and tomorrow", days: (n) => `for the next ${n} days` },
      ahead: { sameDay: "the same day", days: (n) => `${n} ${n === 1 ? "day" : "days"} before` },
      when: { overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", days: (n) => `In ${n} days` },
      usually: (day) => `you usually pay it on the ${ordinal(day)}`,
      approximate: " (approx.)",
    },
  },
);

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd": el día del mes en inglés. */
export function ordinal(day: number): string {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  return `${day}${suffix}`;
}

/** Los días que mira la tarjeta, para su texto: "de hoy", "de hoy y mañana" o "de los próximos 3 días". */
export function windowPhrase(daysAhead: number, locale: Locale = DEFAULT_LOCALE): string {
  const { window } = TEXTS[locale];
  if (daysAhead === 0) return window.today;
  if (daysAhead === 1) return window.tomorrow;
  return window.days(daysAhead);
}

/** Con cuánta anticipación, para el aviso al guardar: "el mismo día", "1 día antes" o "5 días antes". */
export function daysAheadPhrase(daysAhead: number, locale: Locale = DEFAULT_LOCALE): string {
  const { ahead } = TEXTS[locale];
  if (daysAhead === 0) return ahead.sameDay;
  return ahead.days(daysAhead);
}

/** Cuándo, en palabras: "Atrasado", "Hoy", "Mañana" o "En 3 días". */
export function whenLabel(days: number, locale: Locale = DEFAULT_LOCALE): string {
  const { when } = TEXTS[locale];
  if (days < 0) return when.overdue;
  if (days === 0) return when.today;
  if (days === 1) return when.tomorrow;
  return when.days(days);
}

/** La fecha y de dónde sale: "5 de oct. · lo sueles pagar el 5" (con "aprox." si son pocos pagos; con el año si no es el actual). */
export function dateLine(payment: UpcomingPayment, today: string, locale: Locale = DEFAULT_LOCALE): string {
  const t = TEXTS[locale];
  const date = formatShortDate(payment.date, { withYear: payment.date.slice(0, 4) !== today.slice(0, 4), locale });
  return `${date} · ${t.usually(payment.usualDay)}${payment.approximate ? t.approximate : ""}`;
}

/** Un aviso, con sus textos ya armados (para el Resumen y la campana). */
export type UpcomingItem = {
  /** "<clave> YYYY-MM": único entre los avisos. */
  id: string;
  /** La clave del gasto (`searchKey` de la descripción). */
  key: string;
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
  /** "5 de oct. · lo sueles pagar el 5 (aprox.)". */
  dateLine: string;
  overdue: boolean;
  /** La categoría del último pago ("🩺 Salud"): con la que se registra el pago. */
  category: string;
  /** El monto para el campo de "Registrar pago" ("1.800.000,00"). */
  amountInput: string;
};

/** Los avisos con sus textos, en el idioma de la página: los nombres de los meses salen de Intl, en el servidor. */
export function upcomingItems(
  payments: (UpcomingPayment & { category?: string | null })[],
  today: string,
  currency: string,
  locale: Locale = DEFAULT_LOCALE,
): UpcomingItem[] {
  return payments.map((payment) => ({
    id: `${payment.key} ${payment.month}`,
    key: payment.key,
    description: payment.description,
    emoji: payment.emoji,
    month: payment.month,
    monthName: formatMonthName(monthOf(`${payment.month}-01`), { withYear: payment.month.slice(0, 4) !== today.slice(0, 4), locale }),
    amount: `≈ −${formatMoney(payment.amount, currency, locale)}`,
    when: whenLabel(payment.days, locale),
    dateLine: dateLine(payment, today, locale),
    overdue: payment.days < 0,
    category: payment.category ?? NO_CATEGORIES[locale],
    amountInput: amountInputValue(payment.amount, locale),
  }));
}
