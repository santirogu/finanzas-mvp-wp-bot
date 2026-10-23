import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { formatShortDate } from "@/lib/dates";
import { formatMoney, sumAmounts } from "@/lib/money";
import type { HistoryMonth } from "./history";
import type { FixedOption } from "./recurring";
import { daysBetween, ordinal, paymentSchedules } from "./upcoming";

// El estado del mes de los gastos fijos (la pestaña Fijos): cuáles ya se pagaron este mes, cuáles faltan (y si
// están atrasados) y cuáles se marcaron "Este pago ya no aplica". Usa el mismo calendario de pagos que los avisos de
// próximos pagos (paymentSchedules): dice lo mismo que el Resumen y "Lo que te queda". Sin base de datos.

export type FixedMonthStatus =
  | { kind: "paid"; paidOn: string }
  | { kind: "pending"; date: string; overdue: boolean; usualDay: number; approximate: boolean }
  | { kind: "skipped" };

export type FixedMonth = {
  /** El estado de cada gasto fijo que tiene un pago esperado este mes, por su clave. */
  statuses: Map<string, FixedMonthStatus>;
  paid: number;
  /** Los pagos de este mes que cuentan: los pagados y los que faltan (sin los que "ya no aplican"). */
  expected: number;
  /** Lo que suman los que faltan (lo del último mes de cada uno): lo mismo que resta "Lo que te queda". */
  pendingTotal: number;
};

/**
 * El mes de `today` (YYYY-MM-DD, en la zona de la persona) de cada gasto fijo (`items`). `history` y `skipped`, como
 * en `upcomingPayments`. Un pago que ya se hizo cuenta aunque después se haya marcado "ya no aplica".
 */
export function fixedMonth(
  items: (FixedOption & { amount: number })[],
  history: HistoryMonth[],
  skipped: ReadonlySet<string>,
  today: string,
): FixedMonth {
  const month = today.slice(0, 7);
  const schedules = paymentSchedules(items, history, today);
  const statuses = new Map<string, FixedMonthStatus>();
  const pending: number[] = [];
  let paid = 0;
  for (const item of items) {
    const schedule = schedules.get(item.key);
    const due = schedule?.due.find((d) => d.month === month);
    if (!schedule || !due) continue;
    if (due.paidOn) {
      statuses.set(item.key, { kind: "paid", paidOn: due.paidOn });
      paid += 1;
    } else if (skipped.has(`${item.key} ${month}`)) {
      statuses.set(item.key, { kind: "skipped" });
    } else {
      statuses.set(item.key, {
        kind: "pending",
        date: due.date,
        overdue: daysBetween(today, due.date) < 0,
        usualDay: schedule.day,
        approximate: schedule.approximate,
      });
      pending.push(item.amount);
    }
  }
  return { statuses, paid, expected: paid + pending.length, pendingTotal: sumAmounts(pending) };
}

/** Cómo se lee el estado de un gasto: `tone` decide el color (atrasado, en rojo, como en los próximos pagos). */
export type FixedStatusView = { text: string; tone: "paid" | "pending" | "overdue" | "skipped" };

export type FixedMonthView = {
  /** "5 de 8 pagados este mes" y "Faltan $1.200.000,00" (null si no falta ninguno); null sin pagos este mes. */
  summary: { paid: string; pending: string | null } | null;
  statuses: Record<string, FixedStatusView>;
};

const TEXTS = texts(
  {
    count: (paid: number, expected: number) => (paid === expected ? "Todos pagados este mes" : `${paid} de ${expected} pagados este mes`),
    pending: (money: string) => `Faltan ${money}`,
    paid: (date: string) => `Pagado el ${date}`,
    usually: (day: number, approximate: boolean) => `lo sueles pagar el ${day}${approximate ? " (aprox.)" : ""}`,
    missing: "Falta",
    overdue: "Atrasado",
    skipped: "No aplica este mes",
  },
  {
    en: {
      count: (paid, expected) => (paid === expected ? "All paid this month" : `${paid} of ${expected} paid this month`),
      pending: (money) => `${money} to go`,
      paid: (date) => `Paid on ${date}`,
      usually: (day, approximate) => `you usually pay it on the ${ordinal(day)}${approximate ? " (approx.)" : ""}`,
      missing: "Not paid yet",
      overdue: "Overdue",
      skipped: "Doesn't apply this month",
    },
  },
);

/** El estado del mes en el idioma de la página, con los montos en la moneda de la persona. */
export function fixedMonthView(month: FixedMonth, today: string, currency: string, locale: Locale = DEFAULT_LOCALE): FixedMonthView {
  const t = TEXTS[locale];
  const view = (status: FixedMonthStatus): FixedStatusView => {
    if (status.kind === "paid") {
      const date = formatShortDate(status.paidOn, { withYear: status.paidOn.slice(0, 4) !== today.slice(0, 4), locale });
      return { text: t.paid(date), tone: "paid" };
    }
    if (status.kind === "skipped") return { text: t.skipped, tone: "skipped" };
    const usually = t.usually(status.usualDay, status.approximate);
    return status.overdue ? { text: `${t.overdue} · ${usually}`, tone: "overdue" } : { text: `${t.missing} · ${usually}`, tone: "pending" };
  };
  return {
    summary:
      month.expected === 0
        ? null
        : { paid: t.count(month.paid, month.expected), pending: month.pendingTotal > 0 ? t.pending(formatMoney(month.pendingTotal, currency, locale)) : null },
    statuses: Object.fromEntries([...month.statuses].map(([key, status]) => [key, view(status)])),
  };
}
