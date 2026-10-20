import type { Metadata } from "next";
import { Suspense } from "react";
import { getTexts } from "@/i18n/server";
import { PageSkeleton } from "../page-skeleton";
import { TAB_TEXTS } from "../tab-texts";
import { TransactionsView } from "../transactions-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TAB_TEXTS))["/egresos"] };
}

// El aviso después de borrar o deshacer viene en la URL (?borrado=, ?restaurado=): se lee en cada
// request, dentro de Suspense (Cache Components).
export default function EgresosPage({ searchParams }: PageProps<"/[lang]/egresos">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <TransactionsView type="expense" params={params} />
      ))}
    </Suspense>
  );
}
