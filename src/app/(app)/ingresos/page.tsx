import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "../page-skeleton";
import { TransactionsView } from "../transactions-view";

export const metadata: Metadata = { title: "Ingresos" };

export default function IngresosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TransactionsView type="income" />
    </Suspense>
  );
}
