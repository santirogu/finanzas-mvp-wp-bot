import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTexts } from "@/i18n/server";
import { requireUser } from "@/lib/session";
import { getAppValues } from "@/modules/app-values/current";
import { PageSkeleton } from "../page-skeleton";
import { HELP_TEXTS, HelpContent } from "./help-content";
import { TutorialButton } from "./tutorial-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(HELP_TEXTS)).title };
}

// La sesión se lee dentro de Suspense (Cache Components), como en las demás páginas.
export default function AyudaPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Help />
    </Suspense>
  );
}

/** Ayuda con sesión (desde el menú de la cuenta): con las pestañas de la app, sus enlaces y el tutorial. */
async function Help() {
  await requireUser();
  const locale = await getLocale();
  const values = await getAppValues();
  return (
    <HelpContent
      locale={locale}
      values={values}
      signedIn
      tutorial={<TutorialButton values={{ upcomingEnabled: values.upcomingEnabled, budgetNearShare: values.budgetNearShare }} />}
    />
  );
}
