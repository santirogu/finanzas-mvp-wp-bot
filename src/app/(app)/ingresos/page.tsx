import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "../page-skeleton";
import { TransactionsView } from "../transactions-view";

export const metadata: Metadata = { title: "Ingresos" };

// El aviso después de borrar o deshacer viene en la URL (?borrado=, ?restaurado=): se lee en cada
// request, dentro de Suspense (Cache Components).
export default function IngresosPage({ searchParams }: PageProps<"/ingresos">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <TransactionsView type="income" params={params} />
      ))}
    </Suspense>
  );
}
