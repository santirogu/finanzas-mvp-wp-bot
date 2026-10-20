import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChangeLine } from "@/components/change-line";
import { TransactionList } from "@/components/transaction-list";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { compareMonths, currentMonthRange, formatMonthName, monthRange, shiftMonth, todayInTimezone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { inMonthPhrase, monthHref, monthNav, selectedMonth } from "@/lib/month-nav";
import { requireUser } from "@/lib/session";
import { getUpcomingPayments } from "@/modules/reports/queries";
import { upcomingItems, windowPhrase } from "@/modules/reports/upcoming";
import { chartSlices } from "@/modules/transactions/category-chart";
import { balanceChange, totalChange } from "@/modules/transactions/month-comparison";
import { NO_CATEGORIES } from "@/modules/transactions/search";
import {
  getMonthlySummary,
  getTotalsByCategory,
  listActiveMonths,
  listTransactions,
} from "@/modules/transactions/queries";
import { MonthNav } from "../month-nav";
import { PageSkeleton } from "../page-skeleton";
import { TAB_TEXTS } from "../tab-texts";
import { CategoryChart } from "./category-chart";
import { UpcomingPayments } from "./upcoming-payments";
import { WhatsAppHint } from "./whatsapp-hint";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TAB_TEXTS))["/dashboard"] };
}

const TEXTS = texts(
  {
    hello: (name: string) => `Hola, ${name}`,
    balance: "Balance del mes",
    income: "Ingresos",
    expenses: "Egresos",
    recent: "Últimos movimientos",
    recentOf: (month: string) => `Últimos movimientos de ${month}`,
    noneYet: "Aún no tienes movimientos este mes. Registra el primero en Ingresos o Egresos.",
    noneIn: (month: string) => `No tuviste movimientos ${month}.`,
    byCategory: "Gastos por categoría",
    noExpenses: (month: string) => `Sin egresos ${month}.`,
  },
  {
    en: {
      hello: (name) => `Hi, ${name}`,
      balance: "Balance for the month",
      income: "Income",
      expenses: "Expenses",
      recent: "Latest transactions",
      recentOf: (month) => `Latest transactions for ${month}`,
      noneYet: "You don't have transactions this month yet. Add the first one in Income or Expenses.",
      noneIn: (month) => `You had no transactions ${month}.`,
      byCategory: "Spending by category",
      noExpenses: (month) => `No expenses ${month}.`,
    },
  },
);

// El mes viene en la URL (?mes=2026-09): se lee en cada request, dentro de Suspense (Cache Components).
export default function DashboardPage({ searchParams }: PageProps<"/[lang]/dashboard">) {
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
  const locale = await getLocale();
  const t = TEXTS[locale];
  const current = currentMonthRange(user.timezone);
  const range = selectedMonth(month, current);
  const previous = shiftMonth(range, -1);
  const isCurrent = compareMonths(range, current) === 0;
  const today = todayInTimezone(user.timezone);
  const [summary, before, byCategory, recent, activeMonths, upcoming] = await Promise.all([
    getMonthlySummary(user.id, range),
    getMonthlySummary(user.id, monthRange(previous.year, previous.month)),
    getTotalsByCategory(user.id, "expense", range, NO_CATEGORIES[locale]),
    listTransactions(user.id, range, { limit: 6 }),
    listActiveMonths(user.id),
    // Los avisos de próximos pagos son de ahora: solo en el mes actual.
    isCurrent ? getUpcomingPayments(user.id, current, today) : null,
  ]);
  const money = (n: number) => formatMoney(n, user.currency, locale);
  const firstName = user.name.split(" ")[0];
  const inMonth = inMonthPhrase(range, current, locale);
  // Frente al mes anterior, solo si en ese mes hubo movimientos (si no, todo sería "más que agosto").
  const previousName = formatMonthName(previous, { locale });
  const changes = before.count > 0 && {
    balance: balanceChange(summary.balance, before.balance, previousName, user.currency, locale),
    income: totalChange(summary.income, before.income, previousName, "income", locale),
    expense: totalChange(summary.expense, before.expense, previousName, "expense", locale),
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{t.hello(firstName)}</p>
        <MonthNav nav={monthNav("/dashboard", range, current, activeMonths, locale)} heading />
      </div>

      {/* Tres columnas recién desde lg: en un iPad vertical (768-1023 px), con tres, un monto de
          millones no cabe en su tarjeta. Entre sm y lg, el balance arriba a todo el ancho. Los montos
          no se parten (WebKit dejaba el signo de un balance negativo solo en un renglón). */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card p-5 sm:col-span-2 lg:order-last lg:col-span-1">
          <p className="text-sm text-muted">{t.balance}</p>
          {/* Desde 17 caracteres ("$9.999.999.999,99"), un poco más chico: el más largo
              ("−$99.999.999.999,99") no cabe con 30 px en un celular de 375 px ni en la columna de
              un iPad horizontal (e2e/diseno-tactil.spec.ts). */}
          <p
            className={`mt-1 whitespace-nowrap font-semibold tabular-nums ${money(summary.balance).length >= 17 ? "text-2xl" : "text-3xl"} ${summary.balance < 0 ? "text-expense" : ""}`}
          >
            {money(summary.balance)}
          </p>
          {changes && <ChangeLine change={changes.balance} />}
        </div>
        <Link href={monthHref("/ingresos", range, current)} className="card p-5 transition hover:border-income/40">
          <p className="text-sm text-muted">{t.income}</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums text-income">
            {money(summary.income)}
          </p>
          {changes && <ChangeLine change={changes.income} />}
        </Link>
        <Link href={monthHref("/egresos", range, current)} className="card p-5 transition hover:border-expense/40">
          <p className="text-sm text-muted">{t.expenses}</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-semibold tabular-nums text-expense">
            {money(summary.expense)}
          </p>
          {changes && <ChangeLine change={changes.expense} />}
        </Link>
      </section>

      {upcoming && upcoming.payments.length > 0 && (
        <UpcomingPayments items={upcomingItems(upcoming.payments, today, user.currency, locale)} span={windowPhrase(upcoming.days, locale)} today={today} />
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <h2 className="border-b border-border px-4 py-3 font-semibold">
            {isCurrent ? t.recent : t.recentOf(formatMonthName(range, { withYear: range.year !== current.year, locale }))}
          </h2>
          <TransactionList
            items={recent}
            emptyMessage={isCurrent ? t.noneYet : t.noneIn(inMonth)}
            locale={locale}
          />
        </section>

        <div className="space-y-6 lg:col-span-2">
          {/* El WhatsApp se conecta en Mi cuenta: aquí, solo el aviso mientras no esté vinculado. */}
          <WhatsAppHint />
          <section className="card p-4">
            <h2 className="font-semibold">{t.byCategory}</h2>
            {byCategory.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">{t.noExpenses(inMonth)}</p>
            ) : (
              <CategoryChart slices={chartSlices(byCategory, summary.expense)} total={summary.expense} currency={user.currency} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
