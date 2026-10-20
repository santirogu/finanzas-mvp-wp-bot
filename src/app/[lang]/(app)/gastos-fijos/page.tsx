import type { Metadata } from "next";
import { Suspense } from "react";
import type { Locale } from "@/i18n/locales";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { currentMonthRange, type Month } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { lastChangeSummary } from "@/modules/reports/history";
import { reportPeriod } from "@/modules/reports/period";
import { type FixedExpensesReport, getFixedExpenses } from "@/modules/reports/queries";
import { RECURRING_MIN_MONTHS, RECURRING_WINDOW } from "@/modules/reports/recurring";
import { PageSkeleton } from "../page-skeleton";
import { type FixedHistory, FixedExpenses } from "./fixed-expenses";

const TEXTS = texts(
  {
    title: "Gastos fijos",
    intro: (min: number, window: number) => `Los egresos con la misma descripción en al menos ${min} de los últimos ${window} meses, y los que agregaste tú.`,
  },
  {
    en: {
      title: "Bills",
      intro: (min, window) => `Expenses with the same description in at least ${min} of the last ${window} months, and the ones you added.`,
    },
  },
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

// Lee la sesión: va dentro de Suspense (Cache Components).
export default function GastosFijosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Fixed />
    </Suspense>
  );
}

/**
 * "Gastos fijos" (la pestaña Fijos): los egresos que se repiten cada mes, en los últimos 12 meses (sin
 * elegir período: los gastos fijos son de ahora). Reportes los sigue sacando de los gastos más grandes y
 * del gasto por día, pero ya no los muestra.
 */
async function Fixed() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = TEXTS[locale];
  const current = currentMonthRange(user.timezone);
  const period = reportPeriod(undefined, current);
  const fixed = await getFixedExpenses(user.id, period, current);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.intro(RECURRING_MIN_MONTHS, RECURRING_WINDOW)}</p>
      </div>
      <FixedExpenses
        items={fixed.recurring.items}
        histories={historiesView(fixed, current, locale)}
        removed={fixed.recurring.removed}
        candidates={fixed.recurring.candidates}
        total={fixed.recurring.total}
        periodMonths={period.months.length}
        averageExpense={fixed.averageExpense?.amount ?? 0}
        currency={user.currency}
      />
    </div>
  );
}

/**
 * El historial de cada gasto fijo, con su último cambio en una línea ("11% desde marzo"; con el año si no
 * es el actual). Armado aquí: el nombre del mes sale de Intl, en el servidor.
 */
function historiesView(fixed: FixedExpensesReport, current: Month, locale: Locale): Record<string, FixedHistory> {
  const view: Record<string, FixedHistory> = {};
  for (const [key, entries] of Object.entries(fixed.histories)) view[key] = { entries, summary: lastChangeSummary(entries, current, locale) };
  return view;
}
