import { z } from "zod";
import { SearchableTransactionList } from "@/components/searchable-transaction-list";
import { TransactionForm } from "@/components/transaction-form";
import { ToastOnLoad } from "@/components/toaster";
import { getLocale } from "@/i18n/server";
import { compareMonths, currentMonthRange, monthOf, sameDayIn, shiftMonth, todayInTimezone } from "@/lib/dates";
import { formatMoney, sumAmounts } from "@/lib/money";
import { inMonthPhrase, monthHref, monthNav, selectedMonth } from "@/lib/month-nav";
import { requireUser } from "@/lib/session";
import { restoreTransactionAction } from "@/modules/transactions/actions";
import {
  getTransactionNotice,
  listActiveMonths,
  listCategories,
  listDescriptionSuggestions,
  listTransactions,
} from "@/modules/transactions/queries";
import { MonthNav } from "./month-nav";

type Params = Record<string, string | string[] | undefined>;

/** De cuántos meses atrás salen las descripciones que se sugieren al escribir. */
const SUGGESTION_MONTHS = 6;

/**
 * El aviso que pide la URL: ?borrado=<id> después de borrar (rojo, con "Deshacer"), ?restaurado=<id>
 * después de deshacer (verde). Lleva el id, no la descripción: el servidor la busca, solo si el
 * movimiento es de la persona (y, el borrado, de hace menos de 10 minutos).
 */
function noticeFrom(params: Params) {
  for (const [key, kind] of [["borrado", "deleted"], ["restaurado", "restored"]] as const) {
    const id = z.uuid().safeParse(params[key]);
    if (id.success) return { id: id.data, kind };
  }
  return null;
}

// Vista compartida por las pestañas de Ingresos y Egresos, en el mes que pide la URL (?mes=).
export async function TransactionsView({ type, params = {} }: { type: "income" | "expense"; params?: Params }) {
  const user = await requireUser();
  const today = todayInTimezone(user.timezone);
  const current = currentMonthRange(user.timezone);
  const range = selectedMonth(params.mes, current);
  const requested = noticeFrom(params);
  const [items, categories, notice, activeMonths, suggestions] = await Promise.all([
    listTransactions(user.id, range, { type }),
    listCategories(user.id, type),
    requested ? getTransactionNotice(user.id, requested.id, requested.kind) : null,
    listActiveMonths(user.id),
    // Las descripciones de los últimos meses, para sugerirlas al escribir.
    listDescriptionSuggestions(user.id, type, sameDayIn(shiftMonth(monthOf(today), -SUGGESTION_MONTHS), today)),
  ]);
  const total = sumAmounts(items.map((t) => t.amount));
  const isIncome = type === "income";
  const path = isIncome ? "/ingresos" : "/egresos";
  const inMonth = inMonthPhrase(range, current);
  const noun = isIncome ? "ingresos" : "egresos";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <MonthNav nav={monthNav(path, range, current, activeMonths, await getLocale())} />
          <h1 className="text-2xl font-semibold tracking-tight">
            {isIncome ? "Ingresos" : "Egresos"}
          </h1>
        </div>
        <p className={`text-2xl font-semibold tabular-nums ${isIncome ? "text-income" : "text-expense"}`}>
          {formatMoney(total, user.currency)}
        </p>
      </div>

      {/* grid-cols-1: sin columnas definidas, una descripción o una categoría larga ensancharía la
          rejilla más que la pantalla del celular (e2e/diseno-tactil.spec.ts). */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          {/* key: al cambiar de mes, el formulario vuelve a empezar con la fecha de ese mes. */}
          <TransactionForm
            key={range.start}
            type={type}
            categories={categories}
            today={today}
            defaultDate={sameDayIn(range, today)}
            listMonth={range}
            suggestions={suggestions}
          />
        </div>
        <section className="card lg:col-span-3">
          {requested && notice && (
            <ToastOnLoad
              cleanHref={monthHref(path, range, current)}
              toast={
                requested.kind === "deleted"
                  ? {
                      id: `borrado:${notice.id}`,
                      tone: "removal",
                      message: `Se borró «${notice.description}»`,
                      action: { label: "Deshacer", formAction: restoreTransactionAction, fields: { id: notice.id } },
                      focus: true,
                    }
                  : { id: `restaurado:${notice.id}`, tone: "success", message: `Se restauró «${notice.description}»`, focus: true }
              }
            />
          )}
          {/* key: al cambiar de mes, la búsqueda vuelve a empezar. */}
          <SearchableTransactionList
            key={range.start}
            items={items}
            type={type}
            inMonth={inMonth}
            currency={user.currency}
            emptyMessage={
              compareMonths(range, current) === 0
                ? `No has registrado ${noun} este mes.`
                : `No registraste ${noun} ${inMonth}.`
            }
          />
        </section>
      </div>
    </div>
  );
}
