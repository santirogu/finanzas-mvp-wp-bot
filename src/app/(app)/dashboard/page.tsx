import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TransactionList } from "@/components/transaction-list";
import { currentMonthRange, formatMonthLabel } from "@/lib/dates";
import { formatMoney, formatShare } from "@/lib/money";
import { requireUser } from "@/lib/session";
import {
  getMonthlySummary,
  getTotalsByCategory,
  listTransactions,
} from "@/modules/transactions/queries";
import { PageSkeleton } from "../page-skeleton";
import { WhatsAppCard } from "./whatsapp-card";

export const metadata: Metadata = { title: "Resumen" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const range = currentMonthRange(user.timezone);
  const [summary, byCategory, recent] = await Promise.all([
    getMonthlySummary(user.id, range),
    getTotalsByCategory(user.id, "expense", range),
    listTransactions(user.id, range, { limit: 6 }),
  ]);
  const money = (n: number) => formatMoney(n, user.currency);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Hola, {firstName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{formatMonthLabel(range)}</h1>
      </div>

      {/* Tres columnas recién desde lg: en un iPad vertical (768-1023 px), con tres, un monto de
          millones no cabe en su tarjeta. Entre sm y lg, el balance arriba a todo el ancho. Los montos
          no se parten (WebKit dejaba el signo de un balance negativo solo en un renglón). */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card p-5 sm:col-span-2 lg:order-last lg:col-span-1">
          <p className="text-sm text-muted">Balance del mes</p>
          <p
            className={`mt-1 whitespace-nowrap text-3xl font-semibold tabular-nums ${summary.balance < 0 ? "text-expense" : ""}`}
          >
            {money(summary.balance)}
          </p>
        </div>
        <Link href="/ingresos" className="card p-5 transition hover:border-income/40">
          <p className="text-sm text-muted">Ingresos</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums text-income">
            {money(summary.income)}
          </p>
        </Link>
        <Link href="/egresos" className="card p-5 transition hover:border-expense/40">
          <p className="text-sm text-muted">Egresos</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums text-expense">
            {money(summary.expense)}
          </p>
        </Link>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <h2 className="border-b border-border px-4 py-3 font-semibold">Últimos movimientos</h2>
          <TransactionList
            items={recent}
            emptyMessage="Aún no tienes movimientos este mes. Registra el primero en Ingresos o Egresos."
          />
        </section>

        <div className="space-y-6 lg:col-span-2">
          <WhatsAppCard />
          <section className="card p-4">
            <h2 className="font-semibold">Gastos por categoría</h2>
            {byCategory.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Sin egresos este mes.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {byCategory.map((c) => {
                  const pct = summary.expense ? Math.round((c.total / summary.expense) * 100) : 0;
                  return (
                    <li key={c.name}>
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate">
                          {c.emoji} {c.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {money(c.total)} · {formatShare(c.total, summary.expense)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-expense"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
