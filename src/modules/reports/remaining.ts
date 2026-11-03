import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { formatMonthName, monthOf } from "@/lib/dates";
import { formatMoney, formatPercent, roundToCents, sumAmounts } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";
import type { HistoryMonth } from "./history";
import type { FixedOption } from "./recurring";
import { upcomingPayments } from "./upcoming";

// "Lo que te queda este mes" (Resumen, solo con el mes en curso): lo que entró menos lo que salió y los gastos
// fijos que faltan por pagar, cuánto da por día hasta fin de mes y, desde PROJECTION_FROM_DAY, cómo cerraría el
// mes al ritmo del gasto variable (los egresos que no son de gastos fijos). Se resta solo lo fijo que falta: el
// gasto variable que viene es una estimación y va aparte, en la proyección (decisión del dueño).

/** Desde qué día del mes se proyecta el cierre: antes, el ritmo de unos pocos días no dice mucho. */
export const PROJECTION_FROM_DAY = 7;

/** Cuántos gastos fijos que faltan se nombran; el resto, "y 2 más". */
export const PENDING_NAMED = 3;

export type MonthFixed = {
  /** Los pagos de este mes que faltan (sin pagar ni marcados "ya no aplica"), del más próximo al más lejano. */
  pending: { description: string; amount: number }[];
  /** Lo que sumaron este mes los egresos de los gastos fijos. */
  paid: number;
  /** ¿Tiene gastos fijos? Sin ellos no hay nada que decir de lo que falta pagar. */
  hasFixed: boolean;
};

/**
 * Los gastos fijos (`items`) del mes de `today` (YYYY-MM-DD): lo que falta pagar, sin importar con cuánta
 * anticipación avisa la persona, y lo que ya se pagó. `history` y `skipped`, como en `upcomingPayments`.
 */
export function monthFixed(
  items: (FixedOption & { amount: number })[],
  history: HistoryMonth[],
  skipped: ReadonlySet<string>,
  today: string,
): MonthFixed {
  const month = today.slice(0, 7);
  // Con 31 días de anticipación entran todos los de este mes; los atrasados de otros meses y los del siguiente, no.
  const pending = upcomingPayments(items, history, skipped, today, 31)
    .filter((payment) => payment.month === month)
    .map(({ description, amount }) => ({ description, amount }));
  const keys = new Set(items.map((item) => item.key));
  const paid = sumAmounts(history.filter((row) => row.month === month && keys.has(searchKey(row.description))).map((row) => row.total));
  return { pending, paid, hasFixed: items.length > 0 };
}

export type MonthRemaining = {
  /** Lo que queda libre: ingresos − egresos − los gastos fijos que faltan (negativo: no alcanza). */
  free: number;
  /** Cuánto da por día en los que quedan, contando hoy (redondeado); null si no queda nada libre. */
  perDay: number | null;
  day: number;
  daysInMonth: number;
  /** Los días que quedan, contando hoy. */
  daysLeft: number;
  pendingTotal: number;
  /**
   * El cierre del mes a este ritmo (redondeado): los egresos (los de hasta hoy, los fijos que faltan y el gasto
   * variable de cada día hasta hoy en los días que quedan) y lo que sobraría (negativo: faltaría). null en los
   * primeros días.
   */
  projection: { expense: number; leftover: number } | null;
};

/** Una estimación, a la centena: los centavos darían una precisión que no tiene. */
const roughly = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n / 100) * 100 : Math.round(n)) || 0;

/** Lo que queda del mes de `today` con sus totales (`income`, `expense`) y sus gastos fijos. */
export function monthRemaining(totals: { income: number; expense: number }, fixed: MonthFixed, today: string): MonthRemaining {
  const { year, month } = monthOf(today);
  const day = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysLeft = daysInMonth - day + 1;
  const pendingTotal = sumAmounts(fixed.pending.map((payment) => payment.amount));
  const free = roundToCents(totals.income - totals.expense - pendingTotal);
  // El gasto variable: lo que no fue de gastos fijos (un fijo pagado con otro monto no lo deja negativo).
  const variable = Math.max(0, totals.expense - fixed.paid);
  const expense = totals.expense + pendingTotal + (variable / day) * (daysInMonth - day);
  return {
    free,
    perDay: free > 0 ? roughly(free / daysLeft) : null,
    day,
    daysInMonth,
    daysLeft,
    pendingTotal,
    projection: day < PROJECTION_FROM_DAY ? null : { expense: roughly(expense), leftover: roughly(totals.income - expense) },
  };
}

const TEXTS = texts(
  {
    title: "Lo que te queda este mes",
    freeUntil: (date: string) => `Libres hasta el ${date}`,
    date: (day: number, month: string) => `${day} de ${month}`,
    perDay: (amount: string, days: number) =>
      days === 1 ? `${amount} para hoy, el último día del mes` : `Unos ${amount} por día en los ${days} días que quedan`,
    notEnough: "Lo que te entró este mes no alcanza para lo que falta pagar.",
    overspent: "Este mes ya gastaste más de lo que te entró.",
    dayOf: (day: number, days: number) => `Día ${day} de ${days}`,
    monthShare: (share: string) => `${share} del mes`,
    income: "Ingresos",
    expenses: "Egresos",
    pending: (n: number) => (n === 0 ? "Fijos que faltan" : `Fijos que faltan (${n})`),
    allPaid: "Ya pagaste todos los de este mes",
    more: (n: number) => `${n} más`,
    left: "Te quedan",
    projection: (month: string, expense: string, leftover: number, amount: string) =>
      `A este ritmo cerrarías ${month} con ${expense} en egresos: ${leftover >= 0 ? `te sobrarían ${amount}` : `te faltarían ${amount}`}.`,
  },
  {
    en: {
      title: "What's left this month",
      freeUntil: (date) => `Free until ${date}`,
      date: (day, month) => `${month} ${day}`,
      perDay: (amount, days) => (days === 1 ? `${amount} for today, the last day of the month` : `About ${amount} a day for the ${days} days left`),
      notEnough: "What came in this month doesn't cover what's left to pay.",
      overspent: "This month you've already spent more than came in.",
      dayOf: (day, days) => `Day ${day} of ${days}`,
      monthShare: (share) => `${share} of the month`,
      income: "Income",
      expenses: "Expenses",
      pending: (n) => (n === 0 ? "Bills left" : `Bills left (${n})`),
      allPaid: "You've paid them all this month",
      more: (n) => `${n} more`,
      left: "Left",
      projection: (month, expense, leftover, amount) =>
        `At this pace you'd end ${month} with ${expense} in expenses: ${leftover >= 0 ? `${amount} left over` : `${amount} short`}.`,
    },
  },
);

export type RemainingView = {
  title: string;
  label: string;
  free: string;
  negative: boolean;
  /** La línea debajo del monto: cuánto da por día o por qué no queda nada. */
  note: string;
  dayOf: string;
  monthShare: string;
  /** El avance del mes, de 0 a 100 (la barra). */
  progress: number;
  rows: { label: string; amount: string; detail?: string; kind: "income" | "expense" | "total" }[];
  projection: string | null;
};

/** Los textos de la tarjeta, en el idioma de la página. */
export function remainingView(
  remaining: MonthRemaining,
  totals: { income: number; expense: number },
  fixed: MonthFixed,
  today: string,
  currency: string,
  locale: Locale = DEFAULT_LOCALE,
): RemainingView {
  const t = TEXTS[locale];
  const money = (n: number) => formatMoney(n, currency, locale);
  // Lo que se resta, con el signo menos (sin "−$0,00" cuando es cero).
  const minus = (n: number) => money(n === 0 ? 0 : -n);
  const monthName = formatMonthName(monthOf(today), { locale });
  const progress = Math.round((remaining.day / remaining.daysInMonth) * 100);
  const named = fixed.pending.slice(0, PENDING_NAMED).map((payment) => payment.description);
  const rest = fixed.pending.length - named.length;
  const list = new Intl.ListFormat(INTL_LOCALES[locale], { type: "conjunction" });
  const pendingDetail = fixed.pending.length > 0 ? list.format(rest > 0 ? [...named, t.more(rest)] : named) : t.allPaid;
  return {
    title: t.title,
    label: t.freeUntil(t.date(remaining.daysInMonth, monthName)),
    free: money(remaining.free),
    negative: remaining.free < 0,
    note:
      remaining.perDay !== null
        ? t.perDay(money(remaining.perDay), remaining.daysLeft)
        : totals.income - totals.expense < 0
          ? t.overspent
          : t.notEnough,
    dayOf: t.dayOf(remaining.day, remaining.daysInMonth),
    monthShare: t.monthShare(formatPercent(progress, locale)),
    progress,
    rows: [
      { label: t.income, amount: money(totals.income), kind: "income" },
      { label: t.expenses, amount: minus(totals.expense), kind: "expense" },
      ...(fixed.hasFixed
        ? [{ label: t.pending(fixed.pending.length), amount: minus(remaining.pendingTotal), detail: pendingDetail, kind: "expense" as const }]
        : []),
      { label: t.left, amount: money(remaining.free), kind: "total" },
    ],
    projection: remaining.projection
      ? t.projection(
          monthName,
          money(remaining.projection.expense),
          remaining.projection.leftover,
          money(Math.abs(remaining.projection.leftover)),
        )
      : null,
  };
}
