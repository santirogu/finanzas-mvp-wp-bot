"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { formatMoney, sumAmounts } from "@/lib/money";
import type { TransactionRow } from "@/modules/transactions/queries";
import { SEARCH_FROM, searchTransactions } from "@/modules/transactions/search";
import { type ListMarks, TransactionList } from "./transaction-list";

const TEXTS = texts(
  {
    count: (n: number, inMonth: string) => `${n} ${n === 1 ? "movimiento" : "movimientos"} ${inMonth}`,
    hits: (hits: number, total: number, inMonth: string) => `${hits} de ${total} movimientos ${inMonth}`,
    search: { income: "Buscar ingresos", expense: "Buscar egresos" },
    placeholder: "Buscar por descripción o categoría",
    clear: "Borrar la búsqueda",
    noneMatch: "Ninguno coincide",
    status: (hits: number, total: number) => `${hits} de ${total} movimientos`,
    nothing: { income: "Ningún ingreso coincide con", expense: "Ningún egreso coincide con" },
  },
  {
    en: {
      count: (n, inMonth) => `${n} ${n === 1 ? "transaction" : "transactions"} ${inMonth}`,
      hits: (hits, total, inMonth) => `${hits} of ${total} transactions ${inMonth}`,
      search: { income: "Search income", expense: "Search expenses" },
      placeholder: "Search by description or category",
      clear: "Clear the search",
      noneMatch: "None match",
      status: (hits, total) => `${hits} of ${total} transactions`,
      nothing: { income: "No income matches", expense: "No expense matches" },
    },
  },
);

/**
 * La lista del mes de Ingresos y Egresos, con su título ("36 movimientos en septiembre") y, desde
 * SEARCH_FROM movimientos, un buscador por descripción y categoría. Filtra en el navegador los que ya
 * llegaron (no consulta la base): con la búsqueda, el título dice cuántos coinciden de cuántos y cuánto
 * suman. La búsqueda no se guarda: al cambiar de mes o de página vuelve a empezar (sigue al borrar un
 * movimiento).
 */
export function SearchableTransactionList({
  items,
  type,
  inMonth,
  currency,
  emptyMessage,
}: {
  items: TransactionRow[];
  type: "income" | "expense";
  /** "este mes" o "en septiembre" (inMonthPhrase). */
  inMonth: string;
  currency: string;
  emptyMessage: string;
}) {
  const [typed, setTyped] = useState("");
  // Si ya se usó, no desaparece aunque queden menos de SEARCH_FROM (al borrar uno mientras se busca):
  // se perdería la búsqueda a medias, y el foco con ella.
  const [used, setUsed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const locale = useLocale();
  const t = TEXTS[locale];
  const searchable = used || items.length >= SEARCH_FROM;
  const hits = searchable ? searchTransactions(typed, items, locale) : null;
  const shown = hits ? hits.map((h) => h.item) : items;
  const marks: ListMarks | undefined = hits ? new Map(hits.map((h) => [h.item.id, h])) : undefined;
  const isIncome = type === "income";

  const clear = () => {
    setTyped("");
    input.current?.focus();
  };
  const count = hits ? t.hits(hits.length, items.length, inMonth) : t.count(items.length, inMonth);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border px-4 py-3">
        <h2 className="font-semibold">{count}</h2>
        {/* Cuánto suman los que coinciden ("cuánto se fue en Claro este mes"). */}
        {hits && hits.length > 0 && (
          <p className={`whitespace-nowrap text-sm font-semibold tabular-nums ${isIncome ? "text-income" : "text-expense"}`}>
            {isIncome ? "+" : "−"}
            {formatMoney(sumAmounts(shown.map((row) => row.amount)), currency, locale)}
          </p>
        )}
      </div>
      {searchable && (
        <div role="search" className="border-b border-border px-4 py-3">
          <div className="relative">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            >
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="m13 13 4 4" />
            </svg>
            {/* Sin la ✕ del navegador (chica y distinta en cada uno): va la nuestra, de 44 px al tacto. */}
            <input
              ref={input}
              type="search"
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setUsed(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && typed) {
                  e.preventDefault();
                  setTyped("");
                }
                // En el celular, "Buscar" en el teclado lo cierra (la lista ya está filtrada).
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              aria-label={t.search[type]}
              placeholder={t.placeholder}
              autoComplete="off"
              enterKeyHint="search"
              className="input pl-9 pr-11 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {typed && (
              <button
                type="button"
                onClick={clear}
                aria-label={t.clear}
                className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-foreground pointer-fine:size-9"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4" aria-hidden>
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            )}
          </div>
          {/* Para el lector de pantalla: cuántos quedan al escribir (el título cambia, pero no se anuncia). */}
          <p role="status" className="sr-only">
            {hits ? (hits.length === 0 ? t.noneMatch : t.status(hits.length, items.length)) : ""}
          </p>
        </div>
      )}
      {hits && hits.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">
          <p>
            {t.nothing[type]} «{typed.trim()}» {inMonth}.
          </p>
          <button
            type="button"
            onClick={clear}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-background pointer-fine:min-h-9"
          >
            {t.clear}
          </button>
        </div>
      ) : (
        <TransactionList items={shown} allowDelete emptyMessage={emptyMessage} marks={marks} locale={locale} />
      )}
    </>
  );
}
