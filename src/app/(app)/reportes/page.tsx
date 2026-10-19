import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChangeLine } from "@/components/change-line";
import { compareMonths, currentMonthRange, formatMonthLabel, formatMonthName, formatShortMonth, type Month, monthParam } from "@/lib/dates";
import { formatMoney, formatShare } from "@/lib/money";
import { monthHref } from "@/lib/month-nav";
import { requireUser } from "@/lib/session";
import { averagedPhrase, type CategoryReport } from "@/modules/reports/categories";
import { periodOptions, reportPeriod, type ReportPeriod } from "@/modules/reports/period";
import { getReport, type Report } from "@/modules/reports/queries";
import { RECURRING_MIN_MONTHS, RECURRING_WINDOW, type RecurringReport } from "@/modules/reports/recurring";
import type { PeriodSummary } from "@/modules/reports/summary";
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
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="mt-1 text-sm text-muted">{period.range}</p>
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
            <Recurring recurring={report.recurring} period={period} summary={report.summary} money={money} />
          </div>
        </>
      )}
    </div>
  );
}

type Money = (n: number) => string;

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

/** Los mismos números del gráfico, mes a mes y con el balance (cerrado: se abre si se quiere). */
function MonthTable({ report, current, money }: { report: Report; current: Month; money: Money }) {
  return (
    <details className="mt-1 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand pointer-fine:min-h-8">Ver mes a mes</summary>
      <div className="mt-2 overflow-x-auto">
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
            {[...report.series].reverse().map((point) => (
              <tr key={monthParam(point.month)}>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <Link href={monthHref("/dashboard", point.month, current)} className="whitespace-nowrap underline-offset-2 hover:underline">
                    {formatMonthLabel(point.month)}
                  </Link>
                  {compareMonths(point.month, current) === 0 && <span className="ml-1 text-xs text-muted">(en curso)</span>}
                </th>
                <td className="whitespace-nowrap px-3 py-2 text-right text-income">{money(point.income)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-expense">{money(point.expense)}</td>
                <td className={`whitespace-nowrap py-2 pl-3 text-right ${point.balance < 0 ? "text-expense" : ""}`}>{money(point.balance)}</td>
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
