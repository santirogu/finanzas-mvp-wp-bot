import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChangeLine } from "@/components/change-line";
import {
  compareMonths,
  currentMonthRange,
  formatMonthLabel,
  formatMonthName,
  formatShortDate,
  formatShortMonth,
  type Month,
  monthParam,
} from "@/lib/dates";
import { formatMoney, formatShare } from "@/lib/money";
import { monthHref } from "@/lib/month-nav";
import { requireUser } from "@/lib/session";
import { BIGGEST_SHOWN, type ExpenseRow } from "@/modules/reports/biggest";
import { averagedPhrase, type CategoryReport } from "@/modules/reports/categories";
import { periodHref, periodOptions, reportPeriod, type ReportPeriod } from "@/modules/reports/period";
import { getReport, type Report } from "@/modules/reports/queries";
import { RECURRING_MIN_MONTHS, RECURRING_WINDOW, type RecurringReport } from "@/modules/reports/recurring";
import type { PeriodSummary } from "@/modules/reports/summary";
import { NO_CATEGORY } from "@/modules/transactions/search";
import { PageSkeleton } from "../page-skeleton";
import { type TrendPoint, TrendChart } from "./trend-chart";

export const metadata: Metadata = { title: "Reportes" };

// El período viene en la URL (?periodo=2025): se lee en cada request, dentro de Suspense (Cache Components).
export default function ReportesPage({ searchParams }: PageProps<"/reportes">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <Reports period={params.periodo} />
      ))}
    </Suspense>
  );
}

async function Reports({ period: param }: { period: string | string[] | undefined }) {
  const user = await requireUser();
  const current = currentMonthRange(user.timezone);
  const period = reportPeriod(param, current);
  const report = await getReport(user.id, period, current);
  const money = (n: number) => formatMoney(n, user.currency);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
            <p className="mt-1 text-sm text-muted">{period.range}</p>
          </div>
          {(report.summary.income > 0 || report.summary.expense > 0) && <DownloadLink period={period} />}
        </div>
        <nav aria-label="Período" className="mt-3 flex flex-wrap gap-2">
          {periodOptions(period, report.activeMonths).map((option) => (
            <Link
              key={option.id}
              href={option.href}
              aria-current={option.selected ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition pointer-fine:min-h-8 pointer-fine:px-3 ${option.selected ? "border-brand/50 bg-brand/10 font-medium text-foreground" : "border-border text-muted hover:text-foreground"}`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {report.activeMonths.length === 0 ? (
        <section className="card p-6 text-center text-sm text-muted">
          <p>Aún no tienes movimientos.</p>
          <p className="mt-1">Cuando registres tus ingresos y egresos, aquí verás cómo te va mes a mes.</p>
        </section>
      ) : (
        <>
          <Summary summary={report.summary} current={current} money={money} />

          <section className="card p-4" aria-label="Ingresos y egresos por mes">
            <h2 className="font-semibold">
              Ingresos y egresos por mes
            </h2>
            <TrendChart points={trendPoints(report, current)} currency={user.currency} />
            <MonthTable report={report} current={current} money={money} />
          </section>

          {/* Lado a lado recién en un computador: en un iPad, cada una necesita el ancho para sus montos. */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <Categories categories={report.categories} money={money} />
            <div className="space-y-6">
              <Recurring recurring={report.recurring} period={period} summary={report.summary} money={money} />
              <Biggest biggest={report.biggest} hadExpenses={report.summary.expense > 0} current={current} money={money} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type Money = (n: number) => string;

/**
 * "Descargar movimientos (CSV)": los del período, para Excel (src/app/(app)/reportes/exportar/route.ts).
 * Un enlace normal (no `Link`): es una descarga, no una página.
 */
function DownloadLink({ period }: { period: ReportPeriod }) {
  return (
    <a
      href={periodHref(period.id, "/reportes/exportar")}
      download
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-background pointer-fine:min-h-9"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0" aria-hidden>
        <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
        <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
      </svg>
      Descargar movimientos (CSV)
    </a>
  );
}

/** Las barras: con sus textos ya armados (el gráfico se dibuja también en el navegador). */
function trendPoints(report: Report, current: Month): TrendPoint[] {
  return report.series.map((point, i) => ({
    key: monthParam(point.month),
    short: formatShortMonth(point.month),
    year: i === 0 || point.month.month === 1 ? String(point.month.year) : null,
    name: formatMonthLabel(point.month),
    href: monthHref("/dashboard", point.month, current),
    income: point.income,
    expense: point.expense,
    balance: point.balance,
  }));
}

/** El tamaño de un monto en su tarjeta: desde 17 caracteres ("$9.999.999.999,99"), un poco más chico. */
const amountSize = (label: string) => (label.length >= 17 ? "text-xl" : "text-2xl");

function Stat({ label, value, note, tone = "", className = "" }: { label: string; value: string; note?: string; tone?: string; className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 whitespace-nowrap font-semibold tabular-nums ${amountSize(value)} ${tone}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

/**
 * Las cifras del período. En un iPad vertical y en el celular horizontal, de a dos (el balance a todo el
 * ancho); en un computador, tres arriba y dos abajo. Los montos no se parten.
 */
function Summary({ summary, current, money }: { summary: PeriodSummary; current: Month; money: Money }) {
  const { averageExpense: average, topMonth } = summary;
  const savedNote =
    summary.saved === "overspent"
      ? "Gastaste más de lo que ganaste"
      : summary.saved
        ? `Ahorraste el ${summary.saved}% de tus ingresos`
        : undefined;
  const averageNote = average
    ? `En ${average.months} ${average.months === 1 ? "mes" : "meses"}${average.withoutCurrent ? `, sin ${formatMonthName(current)} (va en curso)` : ""}`
    : "Se calcula cuando termine tu primer mes";
  return (
    <section aria-label="Resumen del período" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <Stat label="Ingresos" value={money(summary.income)} tone="text-income" className="lg:col-span-2" />
      <Stat label="Egresos" value={money(summary.expense)} tone="text-expense" className="lg:col-span-2" />
      <Stat
        label="Balance del período"
        value={money(summary.balance)}
        note={savedNote}
        tone={summary.balance < 0 ? "text-expense" : ""}
        className="sm:col-span-2"
      />
      <Stat label="Gasto promedio por mes" value={average ? money(average.amount) : "—"} note={averageNote} className="lg:col-span-3" />
      <Stat
        label="El mes de más gasto"
        value={topMonth ? formatMonthLabel(topMonth.month) : "—"}
        note={topMonth ? money(topMonth.expense) : "Sin egresos en el período"}
        className="lg:col-span-3"
      />
    </section>
  );
}

/**
 * Los mismos números del gráfico, mes a mes y con el balance (cerrado: se abre si se quiere). En una
 * tabla desde 640 px; en un celular, cuatro columnas de montos no caben (la de Balance quedaba
 * escondida a la derecha): cada mes va con sus tres montos debajo.
 */
function MonthTable({ report, current, money }: { report: Report; current: Month; money: Money }) {
  const months = [...report.series].reverse().map((point) => ({
    ...point,
    key: monthParam(point.month),
    href: monthHref("/dashboard", point.month, current),
    label: formatMonthLabel(point.month),
    inProgress: compareMonths(point.month, current) === 0,
  }));
  const balanceTone = (balance: number) => (balance < 0 ? "text-expense" : "text-foreground");
  return (
    <details className="mt-1 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand pointer-fine:min-h-8">Ver mes a mes</summary>
      <ul className="mt-2 divide-y divide-border sm:hidden">
        {months.map((m) => (
          <li key={m.key} className="py-2">
            <p>
              <Link href={m.href} className="underline-offset-2 hover:underline">
                {m.label}
              </Link>
              {m.inProgress && <span className="ml-1 text-xs text-muted">(en curso)</span>}
            </p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted">
              <span>
                Ingresos <span className="whitespace-nowrap text-income">{money(m.income)}</span>
              </span>
              <span>
                Egresos <span className="whitespace-nowrap text-expense">{money(m.expense)}</span>
              </span>
              <span>
                Balance <span className={`whitespace-nowrap ${balanceTone(m.balance)}`}>{money(m.balance)}</span>
              </span>
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-2 hidden overflow-x-auto sm:block">
        <table className="w-full tabular-nums">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 font-medium">Mes</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Ingresos</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Egresos</th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {months.map((m) => (
              <tr key={m.key}>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <Link href={m.href} className="whitespace-nowrap underline-offset-2 hover:underline">
                    {m.label}
                  </Link>
                  {m.inProgress && <span className="ml-1 text-xs text-muted">(en curso)</span>}
                </th>
                <td className="whitespace-nowrap px-3 py-2 text-right text-income">{money(m.income)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-expense">{money(m.expense)}</td>
                <td className={`whitespace-nowrap py-2 pl-3 text-right ${balanceTone(m.balance)}`}>{money(m.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// Los colores de cada puesto de la paleta de los gráficos (globals.css), los mismos de la dona del
// Resumen. Escritos completos: Tailwind solo genera las clases que encuentra así en el código.
const BARS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6", "bg-chart-7"];

function Categories({ categories, money }: { categories: CategoryReport; money: Money }) {
  const { rows, compared, averaged } = categories;
  const biggest = rows[0]?.share ?? 1;
  return (
    <section className="card p-4" aria-label="Gastos por categoría">
      <h2 className="font-semibold">
        Gastos por categoría
      </h2>
      <p className="mt-1 text-sm text-muted">
        Lo que sumó cada una en el período
        {compared && averaged.length > 0
          ? `, y cómo te fue en ${formatMonthName(compared)} frente a su promedio de ${averagedPhrase(averaged)}.`
          : "."}
      </p>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Sin egresos en el período.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row) => (
            <li key={`${row.emoji} ${row.name}`} className="py-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {row.emoji} {row.name}
                </span>
                <span className="shrink-0 whitespace-nowrap tabular-nums text-muted">
                  <span className="text-foreground">{money(row.total)}</span> · {formatShare(row.total, categories.total)}%
                </span>
              </div>
              <div aria-hidden className="mt-1.5 h-1.5 rounded-full bg-background">
                <div
                  className={`h-full rounded-full ${row.color === null ? "bg-chart-rest" : BARS[row.color]}`}
                  style={{ width: `${Math.max((row.share / biggest) * 100, 1)}%` }}
                />
              </div>
              {row.change && <ChangeLine change={row.change} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Recurring({ recurring, period, summary, money }: { recurring: RecurringReport; period: ReportPeriod; summary: PeriodSummary; money: Money }) {
  const average = summary.averageExpense?.amount ?? 0;
  return (
    <section className="card p-4" aria-label="Gastos fijos">
      <h2 className="font-semibold">
        Gastos fijos
      </h2>
      <p className="mt-1 text-sm text-muted">
        Los egresos con la misma descripción en al menos {RECURRING_MIN_MONTHS} de los últimos {RECURRING_WINDOW} meses.
      </p>
      {recurring.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Todavía no hay egresos que se repitan cada mes.</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border">
            {recurring.items.map((item) => (
              <li key={item.description} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {item.emoji} {item.description}
                  </p>
                  <p className="text-xs text-muted">
                    En {item.months} de {period.months.length} {period.months.length === 1 ? "mes" : "meses"}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-expense">−{money(item.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm font-semibold">
            <span>Total al mes</span>
            <span className="whitespace-nowrap tabular-nums">−{money(recurring.total)}</span>
          </div>
          {average > 0 && (
            <p className="mt-1 text-xs text-muted">Son el {formatShare(recurring.total, average)}% de tu gasto promedio por mes.</p>
          )}
        </>
      )}
    </section>
  );
}

function Biggest({ biggest, hadExpenses, current, money }: { biggest: ExpenseRow[]; hadExpenses: boolean; current: Month; money: Money }) {
  const first = biggest.slice(0, BIGGEST_SHOWN);
  const rest = biggest.slice(BIGGEST_SHOWN);
  const row = (expense: ExpenseRow) => {
    const date = formatShortDate(expense.occurredOn, { withYear: Number(expense.occurredOn.slice(0, 4)) !== current.year });
    return (
      <li key={expense.id}>
        {/* Toda la fila lleva a editarlo (al guardar, se vuelve a Egresos, al mes del movimiento). */}
        <Link
          href={`/movimientos/${expense.id}/editar`}
          className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-background"
        >
          <span className="min-w-0">
            <span className="sr-only">Editar </span>
            <span className="block truncate">
              <span aria-hidden>{expense.categoryEmoji ?? "•"} </span>
              {expense.description}
            </span>
            <span className="block text-xs text-muted">
              {date} · {expense.categoryName ?? NO_CATEGORY}
            </span>
          </span>
          <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-expense">−{money(expense.amount)}</span>
        </Link>
      </li>
    );
  };
  return (
    <section className="card p-4" aria-label="Los gastos más grandes">
      <h2 className="font-semibold">Los gastos más grandes</h2>
      <p className="mt-1 text-sm text-muted">Los egresos más altos del período, sin contar los gastos fijos. Toca uno para editarlo.</p>
      {biggest.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {hadExpenses ? "Todos los egresos del período son gastos fijos." : "Sin egresos en el período."}
        </p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border">{first.map(row)}</ul>
          {rest.length > 0 && (
            <details className="text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand pointer-fine:min-h-8">
                Ver {rest.length === 1 ? "el siguiente" : `los ${rest.length} siguientes`}
              </summary>
              <ul className="divide-y divide-border border-t border-border">{rest.map(row)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
