import type { Metadata } from "next";
import { Suspense } from "react";
import { getTexts } from "@/i18n/server";
import { PageSkeleton } from "../page-skeleton";
import { TAB_TEXTS } from "../tab-texts";
import { TransactionsView } from "../transactions-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TAB_TEXTS))["/ingresos"] };
}

// El aviso después de borrar o deshacer viene en la URL (?borrado=, ?restaurado=): se lee en cada
// request, dentro de Suspense (Cache Components).
export default function IngresosPage({ searchParams }: PageProps<"/[lang]/ingresos">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <TransactionsView type="income" params={params} />
      ))}
    </Suspense>
  );
}
