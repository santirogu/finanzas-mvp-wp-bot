import type { Metadata } from "next";
import { Suspense } from "react";
import type { Locale } from "@/i18n/locales";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { currentMonthRange, type Month, todayInTimezone } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { getAppValues } from "@/modules/app-values/current";
import { fixedMonthView } from "@/modules/reports/fixed-month";
import { lastChangeSummary } from "@/modules/reports/history";
import { reportPeriod } from "@/modules/reports/period";
import { type FixedExpensesReport, getFixedExpenses, getFixedMonth } from "@/modules/reports/queries";
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
 * elegir período: los gastos fijos son de ahora), con el estado de este mes de cada uno (pagado o no). Reportes
 * los sigue sacando de los gastos más grandes y del gasto por día, pero ya no los muestra.
 */
async function Fixed() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = TEXTS[locale];
  const current = currentMonthRange(user.timezone);
  const today = todayInTimezone(user.timezone);
  const period = reportPeriod(undefined, current);
  // Cuándo un gasto es fijo lo eligió el admin (Valores de la app).
  const [fixed, values, month] = await Promise.all([getFixedExpenses(user.id, period, current), getAppValues(), getFixedMonth(user.id, current, today)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.intro(values.recurringMinMonths, values.recurringWindow)}</p>
      </div>
      <FixedExpenses
        items={fixed.recurring.items}
        histories={historiesView(fixed, current, locale)}
        month={fixedMonthView(month, today, user.currency, locale)}
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
  // Con fromEntries: una clave como "__proto__" queda como una más (asignada, cambiaría el prototipo).
  return Object.fromEntries(
    Object.entries(fixed.histories).map(([key, entries]) => [key, { entries, summary: lastChangeSummary(entries, current, locale) }]),
  );
}
