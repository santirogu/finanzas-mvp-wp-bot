import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChangeLine } from "@/components/change-line";
import { ScrollToHash } from "@/components/scroll-to-hash";
import type { Locale } from "@/i18n/locales";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import {
  compareMonths,
  currentMonthRange,
  formatMonthLabel,
  formatMonthName,
  formatShortDate,
  formatShortMonth,
  type Month,
  monthParam,
  todayInTimezone,
} from "@/lib/dates";
import { formatMoney, formatPercent, formatShare } from "@/lib/money";
import { monthHref } from "@/lib/month-nav";
import { requireUser } from "@/lib/session";
import { BIGGEST_SHOWN, type ExpenseRow, withoutFixed } from "@/modules/reports/biggest";
import { averagedPhrase, type CategoryReport } from "@/modules/reports/categories";
import {
  averagedRange,
  calendarDays,
  calendarHref,
  calendarMonth,
  type DayDescriptionTotal,
  dayTotals,
  halves,
  heatLevels,
  insightPhrase,
  weekdayAverages,
  weekdayInsight,
  weekdayName,
  weekdayOf,
} from "@/modules/reports/daily";
import { periodHref, periodOptions, type ReportPeriod, reportPeriod } from "@/modules/reports/period";
import { getExpensesByDay, getMonthExpenses, getReport, type Report } from "@/modules/reports/queries";
import { averageNote, type PeriodSummary, savedNote } from "@/modules/reports/summary";
import { NO_CATEGORIES } from "@/modules/transactions/search";
import { PageSkeleton } from "../page-skeleton";
import { TAB_TEXTS } from "../tab-texts";
import { DailySpending, type DailySpendingProps } from "./daily-spending";
import { DownloadMenu } from "./download-menu";
import { type TrendPoint, TrendChart } from "./trend-chart";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TAB_TEXTS))["/reportes"] };
}

const TEXTS = texts(
  {
    title: "Reportes",
    period: "Período",
    noData: "Aún no tienes movimientos.",
    noDataHint: "Cuando registres tus ingresos y egresos, aquí verás cómo te va mes a mes.",
    byMonth: "Ingresos y egresos por mes",
    allFixed: "Todos los egresos del período son gastos fijos.",
    noExpenses: "Sin egresos en el período.",
    day: (weekday: string, day: number, month: string) => `${weekday} ${day} de ${month}`,
    summary: "Resumen del período",
    income: "Ingresos",
    expenses: "Egresos",
    balance: "Balance del período",
    average: "Gasto promedio por mes",
    topMonth: "El mes de más gasto",
    noExpensesNote: "Sin egresos en el período",
    monthByMonth: "Ver mes a mes",
    inProgress: "(en curso)",
    month: "Mes",
    balanceShort: "Balance",
    categories: "Egresos por categoría",
    categoriesIntro: "Lo que sumó cada una en el período",
    categoriesCompared: (month: string, averaged: string) => `, y cómo le fue en ${month} frente a su promedio de ${averaged}.`,
    biggest: "Los egresos más grandes",
    biggestIntro: "Los egresos más altos del período, sin contar los gastos fijos. Toca uno para editarlo.",
    edit: "Editar ",
    seeMore: (n: number) => (n === 1 ? "Ver el siguiente" : `Ver los ${n} siguientes`),
  },
  {
    en: {
      title: "Reports",
      period: "Period",
      noData: "You don't have transactions yet.",
      noDataHint: "Once you add your income and expenses, you'll see how you're doing month by month here.",
      byMonth: "Income and expenses by month",
      allFixed: "All the expenses in the period are bills.",
      noExpenses: "No expenses in the period.",
      day: (weekday, day, month) => `${weekday}, ${month} ${day}`,
      summary: "Period summary",
      income: "Income",
      expenses: "Expenses",
      balance: "Balance for the period",
      average: "Average spending per month",
      topMonth: "The month with the most spending",
      noExpensesNote: "No expenses in the period",
      monthByMonth: "See month by month",
      inProgress: "(in progress)",
      month: "Month",
      balanceShort: "Balance",
      categories: "Expenses by category",
      categoriesIntro: "What each one added up to in the period",
      categoriesCompared: (month, averaged) => `, and how you did in ${month} compared with its average for ${averaged}.`,
      biggest: "The biggest expenses",
      biggestIntro: "The highest expenses in the period, not counting your bills. Tap one to edit it.",
      edit: "Edit ",
      seeMore: (n) => (n === 1 ? "See the next one" : `See the next ${n}`),
    },
  },
);

type Texts = (typeof TEXTS)["es"];

// El período (?periodo=2025) y el mes del calendario (?calendario=2026-09) vienen en la URL: se leen en
// cada request, dentro de Suspense (Cache Components).
export default function ReportesPage({ searchParams }: PageProps<"/[lang]/reportes">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <Reports period={params.periodo} calendar={params.calendario} />
      ))}
    </Suspense>
  );
}

type Param = string | string[] | undefined;

async function Reports({ period: param, calendar: calendarParam }: { period: Param; calendar: Param }) {
  const user = await requireUser();
  const locale = await getLocale();
  const t = TEXTS[locale];
  const current = currentMonthRange(user.timezone);
  const period = reportPeriod(param, current, locale);
  const calendar = calendarMonth(calendarParam, period);
  const [report, byDay, monthExpenses] = await Promise.all([
    getReport(user.id, period, current, locale),
    getExpensesByDay(user.id, period.months[0], period.months[period.months.length - 1]),
    getMonthExpenses(user.id, calendar, locale),
  ]);
  const money = (n: number) => formatMoney(n, user.currency, locale);

  return (
    <div className="space-y-6">
      <div>
        {/* El botón de descargas, siempre a la derecha del título (sin partir la línea): su lista se abre
            hacia la izquierda y, si el botón bajara al comienzo de la línea, quedaría fuera de la pantalla. */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
            <p className="mt-1 text-sm text-muted">{period.range}</p>
          </div>
          {/* Las descargas, solo si el período tiene movimientos (si no, no hay nada que bajar). */}
          {(report.summary.income > 0 || report.summary.expense > 0) && <DownloadMenu csvHref={periodHref(period.id, "/reportes/exportar")} pdfHref={periodHref(period.id, "/reportes/pdf")} />}
        </div>
        <nav aria-label={t.period} className="mt-3 flex flex-wrap gap-2">
          {periodOptions(period, report.activeMonths, locale).map((option) => (
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
          <p>{t.noData}</p>
          <p className="mt-1">{t.noDataHint}</p>
        </section>
      ) : (
        <>
          <Summary summary={report.summary} current={current} money={money} locale={locale} />

          <section className="card p-4" aria-label={t.byMonth}>
            <h2 className="font-semibold">{t.byMonth}</h2>
            <TrendChart points={trendPoints(report, current, locale)} currency={user.currency} />
            <MonthTable report={report} current={current} money={money} locale={locale} />
          </section>

          {/* Lado a lado recién en un computador: en un iPad, cada una necesita el ancho para sus montos. Los
              gastos fijos tienen su pestaña (/gastos-fijos): aquí solo salen de los gastos más grandes y del
              gasto por día. */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <Categories categories={report.categories} money={money} locale={locale} />
            <Biggest biggest={report.biggest} hadExpenses={report.summary.expense > 0} current={current} money={money} locale={locale} />
          </div>

          {/* Una por mes: al cambiar de mes, el día elegido vuelve a ser el de más gasto. */}
          <DailySpending
            key={monthParam(calendar)}
            {...dailyView({ report, period, month: calendar, byDay, monthExpenses, today: todayInTimezone(user.timezone), locale })}
            currency={user.currency}
          />
        </>
      )}
      {/* El dato del mes del Resumen enlaza a #categorias: la sección llega después (Suspense). */}
      <ScrollToHash />
    </div>
  );
}

type Money = (n: number) => string;

/**
 * "¿Qué días gastas más?": los cálculos de src/modules/reports/daily.ts con sus textos ya armados (los
 * nombres de los meses salen de Intl, en el servidor).
 */
function dailyView({
  report,
  period,
  month,
  byDay,
  monthExpenses,
  today,
  locale,
}: {
  report: Report;
  period: ReportPeriod;
  month: Month;
  byDay: DayDescriptionTotal[];
  monthExpenses: ExpenseRow[];
  today: string;
  locale: Locale;
}): Omit<DailySpendingProps, "currency"> {
  const t = TEXTS[locale];
  const fixed = report.recurring.items;
  const days = dayTotals(byDay, fixed);
  const levelOf = heatLevels([...days.values()].map((day) => day.total));
  const index = period.months.findIndex((m) => compareMonths(m, month) === 0);
  const link = (m: Month | undefined) => (m ? { href: calendarHref(period, m), name: formatMonthName(m, { withYear: true, locale }) } : null);
  const monthName = formatMonthName(month, { locale });
  // activeMonths va del más reciente al más antiguo.
  const { from, to } = averagedRange(period.months, report.activeMonths.at(-1) ?? null, today);
  const averages = weekdayAverages(days, from, to);
  return {
    monthLabel: formatMonthLabel(month, locale),
    prev: link(period.months[index - 1]),
    next: link(period.months[index + 1]),
    offset: weekdayOf(`${monthParam(month)}-01`),
    days: calendarDays(month, days, levelOf, withoutFixed(monthExpenses, fixed), today, locale).map((day) => ({
      ...day,
      name: t.day(weekdayName(weekdayOf(day.date), locale), day.day, monthName),
    })),
    weekdays: averages.map((average, weekday) => {
      const name = weekdayName(weekday, locale);
      return { label: `${name.charAt(0).toUpperCase()}${name.slice(1)}`, average };
    }),
    insight: insightPhrase(weekdayInsight(averages), locale),
    halves: halves(days),
    empty: days.size > 0 ? null : report.summary.expense > 0 ? t.allFixed : t.noExpenses,
  };
}

/** Las barras: con sus textos ya armados (el gráfico se dibuja también en el navegador). */
function trendPoints(report: Report, current: Month, locale: Locale): TrendPoint[] {
  return report.series.map((point, i) => ({
    key: monthParam(point.month),
    short: formatShortMonth(point.month, locale),
    year: i === 0 || point.month.month === 1 ? String(point.month.year) : null,
    name: formatMonthLabel(point.month, locale),
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
function Summary({ summary, current, money, locale }: { summary: PeriodSummary; current: Month; money: Money; locale: Locale }) {
  const t: Texts = TEXTS[locale];
  const { averageExpense: average, topMonth } = summary;
  return (
    <section aria-label={t.summary} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <Stat label={t.income} value={money(summary.income)} tone="text-income" className="lg:col-span-2" />
      <Stat label={t.expenses} value={money(summary.expense)} tone="text-expense" className="lg:col-span-2" />
      <Stat
        label={t.balance}
        value={money(summary.balance)}
        note={savedNote(summary.saved, locale)}
        tone={summary.balance < 0 ? "text-expense" : ""}
        className="sm:col-span-2"
      />
      <Stat label={t.average} value={average ? money(average.amount) : "—"} note={averageNote(average, current, locale)} className="lg:col-span-3" />
      <Stat
        label={t.topMonth}
        value={topMonth ? formatMonthLabel(topMonth.month, locale) : "—"}
        note={topMonth ? money(topMonth.expense) : t.noExpensesNote}
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
function MonthTable({ report, current, money, locale }: { report: Report; current: Month; money: Money; locale: Locale }) {
  const t = TEXTS[locale];
  const months = [...report.series].reverse().map((point) => ({
    ...point,
    key: monthParam(point.month),
    href: monthHref("/dashboard", point.month, current),
    label: formatMonthLabel(point.month, locale),
    inProgress: compareMonths(point.month, current) === 0,
  }));
  const balanceTone = (balance: number) => (balance < 0 ? "text-expense" : "text-foreground");
  return (
    <details className="mt-1 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand pointer-fine:min-h-8">{t.monthByMonth}</summary>
      <ul className="mt-2 divide-y divide-border sm:hidden">
        {months.map((m) => (
          <li key={m.key} className="py-2">
            <p>
              <Link href={m.href} className="underline-offset-2 hover:underline">
                {m.label}
              </Link>
              {m.inProgress && <span className="ml-1 text-xs text-muted">{t.inProgress}</span>}
            </p>
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted">
              <span>
                {t.income} <span className="whitespace-nowrap text-income">{money(m.income)}</span>
              </span>
              <span>
                {t.expenses} <span className="whitespace-nowrap text-expense">{money(m.expense)}</span>
              </span>
              <span>
                {t.balanceShort} <span className={`whitespace-nowrap ${balanceTone(m.balance)}`}>{money(m.balance)}</span>
              </span>
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-2 hidden overflow-x-auto sm:block">
        <table className="w-full tabular-nums">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-3 font-medium">{t.month}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t.income}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t.expenses}</th>
              <th scope="col" className="py-2 pl-3 text-right font-medium">{t.balanceShort}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {months.map((m) => (
              <tr key={m.key}>
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <Link href={m.href} className="whitespace-nowrap underline-offset-2 hover:underline">
                    {m.label}
                  </Link>
                  {m.inProgress && <span className="ml-1 text-xs text-muted">{t.inProgress}</span>}
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

function Categories({ categories, money, locale }: { categories: CategoryReport; money: Money; locale: Locale }) {
  const t = TEXTS[locale];
  const { rows, compared, averaged } = categories;
  const biggest = rows[0]?.share ?? 1;
  return (
    // id: el dato del mes del Resumen enlaza aquí (/reportes#categorias).
    <section id="categorias" className="card scroll-mt-4 p-4" aria-label={t.categories}>
      <h2 className="font-semibold">{t.categories}</h2>
      <p className="mt-1 text-sm text-muted">
        {t.categoriesIntro}
        {compared && averaged.length > 0 ? t.categoriesCompared(formatMonthName(compared, { locale }), averagedPhrase(averaged, locale)) : "."}
      </p>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t.noExpenses}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row) => (
            <li key={`${row.emoji} ${row.name}`} className="py-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {row.emoji} {row.name}
                </span>
                <span className="shrink-0 whitespace-nowrap tabular-nums text-muted">
                  <span className="text-foreground">{money(row.total)}</span> · {formatPercent(formatShare(row.total, categories.total), locale)}
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


function Biggest({
  biggest,
  hadExpenses,
  current,
  money,
  locale,
}: {
  biggest: ExpenseRow[];
  hadExpenses: boolean;
  current: Month;
  money: Money;
  locale: Locale;
}) {
  const t = TEXTS[locale];
  const first = biggest.slice(0, BIGGEST_SHOWN);
  const rest = biggest.slice(BIGGEST_SHOWN);
  const row = (expense: ExpenseRow) => {
    const date = formatShortDate(expense.occurredOn, { withYear: Number(expense.occurredOn.slice(0, 4)) !== current.year, locale });
    return (
      <li key={expense.id}>
        {/* Toda la fila lleva a editarlo (al guardar, se vuelve a Egresos, al mes del movimiento). */}
        <Link
          href={`/movimientos/${expense.id}/editar`}
          className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-background"
        >
          <span className="min-w-0">
            <span className="sr-only">{t.edit}</span>
            <span className="block truncate">
              <span aria-hidden>{expense.categoryEmoji ?? "•"} </span>
              {expense.description}
            </span>
            <span className="block text-xs text-muted">
              {date} · {expense.categoryName ?? NO_CATEGORIES[locale]}
            </span>
          </span>
          <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-expense">−{money(expense.amount)}</span>
        </Link>
      </li>
    );
  };
  return (
    <section className="card p-4" aria-label={t.biggest}>
      <h2 className="font-semibold">{t.biggest}</h2>
      <p className="mt-1 text-sm text-muted">{t.biggestIntro}</p>
      {biggest.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{hadExpenses ? t.allFixed : t.noExpenses}</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border">{first.map(row)}</ul>
          {rest.length > 0 && (
            <details className="text-sm">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand pointer-fine:min-h-8">
                {t.seeMore(rest.length)}
              </summary>
              <ul className="divide-y divide-border border-t border-border">{rest.map(row)}</ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
