"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useToast } from "@/components/toaster";
import { type PaymentSkipState, skipFixedPaymentAction } from "@/modules/reports/actions";
import type { UpcomingItem } from "@/modules/reports/upcoming";

/** Cuántos avisos se ven sin abrir "Mostrar más". */
export const SHOWN = 5;

/**
 * "Próximos pagos" del Resumen (solo si hay alguno): los gastos fijos que tocan en los próximos días y los
 * atrasados (en rojo, como las demás alertas), los primeros SHOWN y el resto con "Mostrar más". "Este pago
 * ya no aplica" oculta el de ese mes y avisa abajo (rojo: algo dejó de mostrarse), con el foco: el aviso
 * ya no está.
 */
export function UpcomingPayments({ items, daysAhead }: { items: UpcomingItem[]; daysAhead: number }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, SHOWN);
  const rest = items.length - SHOWN;
  return (
    <section className="card p-4" aria-label="Próximos pagos">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-semibold">Próximos pagos</h2>
        <Link href="/gastos-fijos" className="inline-flex min-h-11 items-center text-sm font-medium text-brand pointer-fine:min-h-6">
          Ver gastos fijos
        </Link>
      </div>
      <p className="text-sm text-muted">Tus gastos fijos de los próximos {daysAhead} días y los que todavía no registras.</p>
      <ul className="mt-2 divide-y divide-border">
        {shown.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand pointer-fine:min-h-8"
        >
          {expanded ? "Mostrar menos" : `Mostrar ${rest} más`}
        </button>
      )}
    </section>
  );
}

function Item({ item }: { item: UpcomingItem }) {
  const toast = useToast();
  const [state, formAction, busy] = useActionState<PaymentSkipState, FormData>(async (prev, formData) => {
    const result = await skipFixedPaymentAction(prev, formData);
    if (result.message && result.tone) toast({ tone: result.tone, message: result.message, focus: true });
    return result;
  }, {});
  return (
    <li className="flex items-start justify-between gap-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate">
          <span aria-hidden>{item.emoji} </span>
          {item.description}
        </p>
        <p className="text-xs text-muted">{item.dateLine}</p>
        <form action={formAction}>
          <input type="hidden" name="description" value={item.description} />
          <input type="hidden" name="month" value={item.month} />
          <button
            type="submit"
            disabled={busy}
            aria-label={`El pago de ${item.monthName} de ${item.description} ya no aplica`}
            className="inline-flex min-h-11 items-center text-xs font-medium text-brand disabled:opacity-60 pointer-fine:min-h-6"
          >
            {busy ? "Ocultando…" : "Este pago ya no aplica"}
          </button>
          {state.error && (
            <span role="alert" className="block text-xs text-danger">
              {state.error}
            </span>
          )}
        </form>
      </div>
      <div className="shrink-0 text-right">
        <p className="whitespace-nowrap font-semibold tabular-nums text-expense">{item.amount}</p>
        <p className={`text-xs font-medium ${item.overdue ? "text-danger" : "text-foreground"}`}>{item.when}</p>
      </div>
    </li>
  );
}
