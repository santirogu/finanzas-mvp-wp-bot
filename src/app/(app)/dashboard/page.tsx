import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TransactionList } from "@/components/transaction-list";
import { compareMonths, currentMonthRange, formatMonthName, monthRange, shiftMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { inMonthPhrase, monthHref, monthNav, selectedMonth } from "@/lib/month-nav";
import { requireUser } from "@/lib/session";
import { chartSlices } from "@/modules/transactions/category-chart";
import { balanceChange, type MonthChange, totalChange } from "@/modules/transactions/month-comparison";
import {
  getMonthlySummary,
  getTotalsByCategory,
  listActiveMonths,
  listTransactions,
} from "@/modules/transactions/queries";
import { MonthNav } from "../month-nav";
import { PageSkeleton } from "../page-skeleton";
import { CategoryChart } from "./category-chart";
import { WhatsAppHint } from "./whatsapp-hint";

export const metadata: Metadata = { title: "Resumen" };

// El mes viene en la URL (?mes=2026-09): se lee en cada request, dentro de Suspense (Cache Components).
export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <Dashboard month={params.mes} />
      ))}
    </Suspense>
  );
}

async function Dashboard({ month }: { month: string | string[] | undefined }) {
  const user = await requireUser();
  const current = currentMonthRange(user.timezone);
  const range = selectedMonth(month, current);
  const previous = shiftMonth(range, -1);
  const [summary, before, byCategory, recent, activeMonths] = await Promise.all([
    getMonthlySummary(user.id, range),
    getMonthlySummary(user.id, monthRange(previous.year, previous.month)),
    getTotalsByCategory(user.id, "expense", range),
    listTransactions(user.id, range, { limit: 6 }),
    listActiveMonths(user.id),
  ]);
  const money = (n: number) => formatMoney(n, user.currency);
  const firstName = user.name.split(" ")[0];
  const isCurrent = compareMonths(range, current) === 0;
  const inMonth = inMonthPhrase(range, current);
  // Frente al mes anterior, solo si en ese mes hubo movimientos (si no, todo sería "más que agosto").
  const previousName = formatMonthName(previous);
  const changes = before.count > 0 && {
    balance: balanceChange(summary.balance, before.balance, previousName, user.currency),
    income: totalChange(summary.income, before.income, previousName, "ingresos"),
    expense: totalChange(summary.expense, before.expense, previousName, "egresos"),
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Hola, {firstName}</p>
        <MonthNav nav={monthNav("/dashboard", range, current, activeMonths)} heading />
      </div>

      {/* Tres columnas recién desde lg: en un iPad vertical (768-1023 px), con tres, un monto de
          millones no cabe en su tarjeta. Entre sm y lg, el balance arriba a todo el ancho. Los montos
          no se parten (WebKit dejaba el signo de un balance negativo solo en un renglón). */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card p-5 sm:col-span-2 lg:order-last lg:col-span-1">
          <p className="text-sm text-muted">Balance del mes</p>
          {/* Desde 17 caracteres ("$9.999.999.999,99"), un poco más chico: el más largo
              ("−$99.999.999.999,99") no cabe con 30 px en un celular de 375 px ni en la columna de
              un iPad horizontal (e2e/diseno-tactil.spec.ts). */}
          <p
            className={`mt-1 whitespace-nowrap font-semibold tabular-nums ${money(summary.balance).length >= 17 ? "text-2xl" : "text-3xl"} ${summary.balance < 0 ? "text-expense" : ""}`}
          >
            {money(summary.balance)}
          </p>
          {changes && <Change change={changes.balance} />}
        </div>
        <Link href={monthHref("/ingresos", range, current)} className="card p-5 transition hover:border-income/40">
          <p className="text-sm text-muted">Ingresos</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums text-income">
            {money(summary.income)}
          </p>
          {changes && <Change change={changes.income} />}
        </Link>
        <Link href={monthHref("/egresos", range, current)} className="card p-5 transition hover:border-expense/40">
          <p className="text-sm text-muted">Egresos</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums text-expense">
            {money(summary.expense)}
          </p>
          {changes && <Change change={changes.expense} />}
        </Link>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <h2 className="border-b border-border px-4 py-3 font-semibold">
            Últimos movimientos{isCurrent ? "" : ` de ${formatMonthName(range, { withYear: range.year !== current.year })}`}
          </h2>
          <TransactionList
            items={recent}
            emptyMessage={
              isCurrent
                ? "Aún no tienes movimientos este mes. Registra el primero en Ingresos o Egresos."
                : `No tuviste movimientos ${inMonth}.`
            }
          />
        </section>

        <div className="space-y-6 lg:col-span-2">
          {/* El WhatsApp se conecta en Mi cuenta: aquí, solo el aviso mientras no esté vinculado. */}
          <WhatsAppHint />
          <section className="card p-4">
            <h2 className="font-semibold">Gastos por categoría</h2>
            {byCategory.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Sin egresos {inMonth}.</p>
            ) : (
              <CategoryChart slices={chartSlices(byCategory, summary.expense)} total={summary.expense} currency={user.currency} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// Las flechas de la comparación: arriba, abajo o igual (el texto ya lo dice; son solo de apoyo).
const CHANGE_ICONS: Record<MonthChange["direction"], string> = {
  up: "M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06Z",
  down: "M6.28 5.22a.75.75 0 0 0-1.06 1.06l7.22 7.22H6.75a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-1.5 0v5.69L6.28 5.22Z",
  same: "M4 7.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 7.25Zm0 5.5a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1-.75-.75Z",
};

/** "↗ 15% más que agosto", debajo del monto de cada tarjeta. */
function Change({ change }: { change: MonthChange }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-muted">
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0" aria-hidden>
        <path fillRule="evenodd" d={CHANGE_ICONS[change.direction]} clipRule="evenodd" />
      </svg>
      <span className="min-w-0">{change.text}</span>
    </p>
  );
}
