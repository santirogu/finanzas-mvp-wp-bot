import Link from "next/link";
import { BudgetBar } from "@/components/budget-bar";
import type { BudgetRow } from "@/modules/budgets/progress";

/** Los presupuestos en el Resumen (solo con el mes en curso y si hay alguno): una barra por categoría y "Editar". */
export function BudgetsCard({ title, edit, rows }: { title: string; edit: string; rows: BudgetRow[] }) {
  return (
    <section aria-labelledby="presupuestos" className="card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="presupuestos" className="font-semibold">
          {title}
        </h2>
        <Link href="/presupuestos" className="inline-flex min-h-11 items-center text-sm font-medium text-brand pointer-fine:min-h-6">
          {edit}
        </Link>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        {rows.map((row) => (
          <li key={row.categoryId}>
            <BudgetBar row={row} />
          </li>
        ))}
      </ul>
    </section>
  );
}
