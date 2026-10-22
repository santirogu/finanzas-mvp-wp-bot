import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { currentMonthRange, formatMonthName } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { getBudgetProgress, listBudgetCategories } from "@/modules/budgets/budgets";
import { budgetRows } from "@/modules/budgets/progress";
import { PageSkeleton } from "../page-skeleton";
import { Budgets } from "./budgets";

const TEXTS = texts(
  {
    title: "Presupuestos",
    intro: "Un tope por mes para las categorías de egresos que quieras cuidar. Vale todos los meses hasta que lo cambies o lo quites.",
  },
  {
    en: {
      title: "Budgets",
      intro: "A monthly limit for the expense categories you want to watch. It applies every month until you change or remove it.",
    },
  },
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

// Lee la sesión: va dentro de Suspense (Cache Components).
export default function PresupuestosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BudgetsPage />
    </Suspense>
  );
}

/** Los presupuestos (se llega desde el Resumen): cómo va cada uno en el mes en curso, y agregarlos, cambiarlos o quitarlos. */
async function BudgetsPage() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = TEXTS[locale];
  const current = currentMonthRange(user.timezone);
  const [progress, options] = await Promise.all([getBudgetProgress(user.id, current, locale), listBudgetCategories(user.id, locale)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.intro}</p>
      </div>
      <Budgets rows={budgetRows(progress, user.currency, locale)} options={options} month={formatMonthName(current, { locale })} />
    </div>
  );
}
