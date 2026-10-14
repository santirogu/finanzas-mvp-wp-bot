import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "../page-skeleton";
import { TransactionsView } from "../transactions-view";

export const metadata: Metadata = { title: "Egresos" };

export default function EgresosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TransactionsView type="expense" />
    </Suspense>
  );
}
