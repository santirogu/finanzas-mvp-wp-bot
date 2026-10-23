import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChangeLine } from "@/components/change-line";
import { TransactionList } from "@/components/transaction-list";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { compareMonths, currentMonthRange, formatMonthName, monthRange, monthRangeUpTo, shiftMonth, todayInTimezone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { inMonthPhrase, monthHref, monthNav, selectedMonth } from "@/lib/month-nav";
import { requireUser } from "@/lib/session";
import { getBudgetProgress } from "@/modules/budgets/budgets";
import { budgetRows } from "@/modules/budgets/progress";
import { monthFactText } from "@/modules/reports/month-fact";
import { getMonthFact, getMonthFixed, getUpcomingPayments } from "@/modules/reports/queries";
import { monthRemaining, remainingView } from "@/modules/reports/remaining";
import { monthSavedNote } from "@/modules/reports/summary";
import { upcomingItems, windowPhrase } from "@/modules/reports/upcoming";
import { chartSlices } from "@/modules/transactions/category-chart";
import { balanceChange, previousMonthReference, totalChange } from "@/modules/transactions/month-comparison";
import {
  getMonthlySummary,
  getTotalsByCategory,
  listActiveMonths,
  listTransactions,
} from "@/modules/transactions/queries";
import { MonthNav } from "../month-nav";
import { PageSkeleton } from "../page-skeleton";
import { TAB_TEXTS } from "../tab-texts";
import { BudgetsCard } from "./budgets-card";
import { CategoryChart } from "./category-chart";
import { MonthRemaining } from "./month-remaining";
import { RegisterReminderCard } from "./register-reminder";
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
    byCategory: "Egresos por categoría",
    noExpenses: (month: string) => `Sin egresos ${month}.`,
    budgets: (month: string) => `Presupuestos de ${month}`,
    editBudgets: "Editar",
    addBudgets: "Ponle un presupuesto a tus categorías",
    fact: "Dato del mes",
    factLink: "Ver en Reportes",
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
      byCategory: "Expenses by category",
      noExpenses: (month) => `No expenses ${month}.`,
      budgets: (month) => `Budgets for ${month}`,
      editBudgets: "Edit",
      addBudgets: "Set a budget for your categories",
      fact: "This month",
      factLink: "See in Reports",
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
  // Con el mes en curso, el anterior hasta el mismo día: contra el mes entero, a mitad de mes casi todo daría
  // "menos que septiembre".
  const beforeRange = isCurrent ? monthRangeUpTo(previous, today) : monthRange(previous.year, previous.month);
  const [summary, before, byCategory, recent, activeMonths, upcoming, fixed, budgets, fact] = await Promise.all([
    getMonthlySummary(user.id, range),
    getMonthlySummary(user.id, beforeRange),
    getTotalsByCategory(user.id, "expense", range, locale),
    listTransactions(user.id, range, { limit: 6, locale }),
    listActiveMonths(user.id),
    // Los avisos de próximos pagos son de ahora: solo en el mes actual.
    isCurrent ? getUpcomingPayments(user.id, current, today, locale) : null,
    // "Lo que te queda" también es de ahora.
    isCurrent ? getMonthFixed(user.id, current, today) : null,
    // Los presupuestos son de ahora (el monto vale para el mes en curso).
    isCurrent ? getBudgetProgress(user.id, current, locale) : null,
    // El dato del mes compara lo que va del mes en curso con lo mismo de los anteriores ("a esta altura").
    isCurrent ? getMonthFact(user.id, current, today, locale) : null,
  ]);
  const money = (n: number) => formatMoney(n, user.currency, locale);
  const firstName = user.name.split(" ")[0];
  const inMonth = inMonthPhrase(range, current, locale);
  // Frente al mes anterior, solo si en ese mes hubo movimientos (si no, todo sería "más que agosto").
  const ref = previousMonthReference(formatMonthName(previous, { locale }), isCurrent, locale);
  const changes = before.count > 0 && {
    balance: balanceChange(summary.balance, before.balance, ref, user.currency, locale),
    income: totalChange(summary.income, before.income, ref, "income", locale),
    expense: totalChange(summary.expense, before.expense, ref, "expense", locale),
  };
  const saved = monthSavedNote(summary.income, summary.balance, isCurrent, locale);
  // Sin ingresos todavía (antes del sueldo) no hay de qué hablar: todo saldría negativo.
  const remaining =
    fixed && summary.income > 0
      ? remainingView(monthRemaining(summary, fixed, today), summary, fixed, today, user.currency, locale)
      : null;

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
          {saved && <p className="mt-1 text-xs text-muted">{saved}</p>}
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

      {remaining && <MonthRemaining view={remaining} />}

      {upcoming && upcoming.payments.length > 0 && (
        <UpcomingPayments items={upcomingItems(upcoming.payments, today, user.currency, locale)} span={windowPhrase(upcoming.days, locale)} today={today} />
      )}

      {budgets && budgets.length > 0 && (
        <BudgetsCard
          title={t.budgets(formatMonthName(range, { locale }))}
          edit={t.editBudgets}
          rows={budgetRows(budgets, user.currency, locale)}
        />
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
          {/* Si lleva varios días sin registrar nada (con el mes en curso: es de ahora). */}
          {isCurrent && <RegisterReminderCard today={today} />}
          {/* El WhatsApp se conecta en Mi cuenta: aquí, solo el aviso mientras no esté vinculado. */}
          <WhatsAppHint />
          <section className="card p-4">
            <h2 className="font-semibold">{t.byCategory}</h2>
            {byCategory.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">{t.noExpenses(inMonth)}</p>
            ) : (
              <CategoryChart slices={chartSlices(byCategory, summary.expense)} total={summary.expense} currency={user.currency} />
            )}
            {/* La categoría que más se salió de lo normal a esta altura del mes (src/modules/reports/month-fact.ts). */}
            {fact && (
              <section aria-labelledby="dato-del-mes" className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                <h3 id="dato-del-mes" className="text-xs font-medium text-muted">
                  {t.fact}
                </h3>
                <p className="flex items-start gap-2">
                  <span aria-hidden className={`shrink-0 ${fact.direction === "up" ? "text-expense" : "text-income"}`}>
                    {fact.direction === "up" ? "▲" : "▼"}
                  </span>
                  <span className="min-w-0">
                    <span aria-hidden>{fact.emoji} </span>
                    {monthFactText(fact, user.currency, locale)}{" "}
                    <Link href="/reportes#categorias" className="font-medium text-brand underline-offset-2 hover:underline">
                      {t.factLink}
                    </Link>
                  </span>
                </p>
              </section>
            )}
            {/* Sin presupuestos, la invitación a ponerlos (en el mes en curso: son de ahora). */}
            {budgets && budgets.length === 0 && (
              <Link href="/configuracion#presupuestos" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand pointer-fine:min-h-6">
                {t.addBudgets}
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
