import { TransactionForm } from "@/components/transaction-form";
import { TransactionList } from "@/components/transaction-list";
import { currentMonthRange, formatMonthLabel, todayInTimezone } from "@/lib/dates";
import { formatMoney, sumAmounts } from "@/lib/money";
import { requireUser } from "@/lib/session";
import { listCategories, listTransactions } from "@/modules/transactions/queries";

// Vista compartida por las pestañas de Ingresos y Egresos.
export async function TransactionsView({ type }: { type: "income" | "expense" }) {
  const user = await requireUser();
  const range = currentMonthRange(user.timezone);
  const [items, categories] = await Promise.all([
    listTransactions(user.id, range, { type }),
    listCategories(user.id, type),
  ]);
  const total = sumAmounts(items.map((t) => t.amount));
  const isIncome = type === "income";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted">{formatMonthLabel(range)}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isIncome ? "Ingresos" : "Egresos"}
          </h1>
        </div>
        <p className={`text-2xl font-semibold tabular-nums ${isIncome ? "text-income" : "text-expense"}`}>
          {formatMoney(total, user.currency)}
        </p>
      </div>

      {/* grid-cols-1: sin columnas definidas, una descripción o una categoría larga ensancharía la
          rejilla más que la pantalla del celular (e2e/diseno-celular.spec.ts). */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <TransactionForm type={type} categories={categories} today={todayInTimezone(user.timezone)} />
        </div>
        <section className="card lg:col-span-3">
          <h2 className="border-b border-border px-4 py-3 font-semibold">
            {items.length} {items.length === 1 ? "movimiento" : "movimientos"} este mes
          </h2>
          <TransactionList
            items={items}
            allowDelete
            emptyMessage={
              isIncome ? "No has registrado ingresos este mes." : "No has registrado egresos este mes."
            }
          />
        </section>
      </div>
    </div>
  );
}
