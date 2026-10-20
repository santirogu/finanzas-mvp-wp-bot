"use client";

import Link from "next/link";
import { type ReactNode, useActionState, useId, useState } from "react";
import { Buttons, Dialog, FormError } from "@/components/dialog";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import type { FieldMessages } from "@/lib/field-errors";
import { completeAmountDecimals, formatAmountTyping } from "@/lib/money";
import {
  type PaymentSkipState,
  type RegisterPaymentState,
  registerFixedPaymentAction,
  skipFixedPaymentAction,
} from "@/modules/reports/actions";
import type { UpcomingItem } from "@/modules/reports/upcoming";

/** Cuántos avisos se ven sin abrir "Mostrar más". */
export const SHOWN = 5;

/**
 * "Próximos pagos" del Resumen (solo si hay alguno): los gastos fijos que tocan en los próximos días y los
 * atrasados (en rojo, como las demás alertas), los primeros SHOWN y el resto con "Mostrar más". En cada uno,
 * "Registrar pago" abre una ventana con el monto y la fecha para confirmarlo, y "Este pago ya no aplica"
 * oculta el de ese mes. Los dos avisan abajo (verde si se registró, rojo si se ocultó) con el foco: el aviso
 * ya no está.
 */
export function UpcomingPayments({
  items,
  span,
  today,
}: {
  items: UpcomingItem[];
  /** "de los próximos 3 días" (los que eligió la persona). */
  span: string;
  /** Hoy (YYYY-MM-DD, en la zona de la persona): la fecha por defecto y la más tardía de un pago. */
  today: string;
}) {
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
      <p className="text-sm text-muted">Tus gastos fijos {span} y los que todavía no registras.</p>
      <ul className="mt-2 divide-y divide-border">
        {shown.map((item) => (
          <UpcomingPaymentItem key={item.id} item={item} today={today} />
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

/**
 * Un aviso: el gasto, su fecha, el monto y cuándo, con "Registrar pago" y "Este pago ya no aplica" (y lo
 * que agregue quien lo usa, `extra`: la campana suma "Marcar como leído"). Lo usan la tarjeta y la campana.
 */
export function UpcomingPaymentItem({ item, today, extra }: { item: UpcomingItem; today: string; extra?: ReactNode }) {
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
        <div className="mt-1 flex flex-wrap items-center gap-x-3">
          <RegisterPayment item={item} today={today} />
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
          </form>
          {extra}
        </div>
        {state.error && (
          <span role="alert" className="block text-xs text-danger">
            {state.error}
          </span>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="whitespace-nowrap font-semibold tabular-nums text-expense">{item.amount}</p>
        <p className={`text-xs font-medium ${item.overdue ? "text-danger" : "text-foreground"}`}>{item.when}</p>
      </div>
    </li>
  );
}

// Los errores de los campos antes de enviar, en español (los mismos del formulario de Egresos).
const PAYMENT_MESSAGES: Record<string, FieldMessages> = {
  amount: { required: "Escribe el monto." },
  occurredOn: { required: "Elige la fecha.", max: "La fecha no puede ser después de hoy." },
};

/** "Registrar pago": el botón y su ventana (solo montada mientras está abierta). */
function RegisterPayment({ item, today }: { item: UpcomingItem; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Registrar el pago de ${item.description}`}
        className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-xs font-medium transition hover:bg-background pointer-fine:min-h-7"
      >
        Registrar pago
      </button>
      {open && <PaymentDialog item={item} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * La ventana del pago: el monto del último pago y la fecha de hoy, los dos editables. La descripción y la
 * categoría son las del último pago (las pone el servidor). Esc o "Cancelar" la cierran y el foco vuelve al
 * botón; con éxito se cierra y el aviso verde recibe el foco.
 */
function PaymentDialog({ item, today, onClose }: { item: UpcomingItem; today: string; onClose: () => void }) {
  const toast = useToast();
  const ids = { amount: useId(), amountError: useId(), date: useId(), dateError: useId() };
  const { errors, formProps } = useFieldErrors(PAYMENT_MESSAGES);
  const [state, formAction, busy] = useActionState<RegisterPaymentState, FormData>(async (prev, formData) => {
    const result = await registerFixedPaymentAction(prev, formData);
    if (result.message && result.tone) {
      toast({ tone: result.tone, message: result.message, focus: true });
      onClose();
    }
    return result;
  }, {});
  const errorOf = (field: "amount" | "occurredOn") => errors[field] ?? (state.field === field ? state.error : undefined);
  return (
    <Dialog title={`Registrar el pago de ${item.description}`} onClose={onClose}>
      {(dialog) => (
        <form action={formAction} {...formProps} className="space-y-4 text-sm">
          <p id={dialog.description} className="text-muted">
            Categoría: {item.category} · como el último pago.
          </p>
          <input type="hidden" name="description" value={item.description} />
          <div className="space-y-1.5">
            <label htmlFor={ids.amount} className="block font-medium">
              Monto
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-muted pointer-fine:text-sm">$</span>
              <input
                id={ids.amount}
                name="amount"
                inputMode="decimal"
                required
                autoFocus
                defaultValue={item.amountInput}
                aria-invalid={errorOf("amount") ? true : undefined}
                aria-describedby={describedBy(errorOf("amount") && ids.amountError)}
                className="input pl-7 tabular-nums"
                onChange={(event) => {
                  // Puntos de miles mientras se escribe y, tras la coma, hasta dos centavos (como en Egresos).
                  event.target.value = formatAmountTyping(event.target.value);
                }}
                onBlur={(event) => {
                  event.target.value = completeAmountDecimals(event.target.value);
                }}
              />
            </div>
            <FieldError id={ids.amountError} message={errorOf("amount")} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.date} className="block font-medium">
              Fecha
            </label>
            <input
              id={ids.date}
              name="occurredOn"
              type="date"
              required
              max={today}
              defaultValue={today}
              aria-invalid={errorOf("occurredOn") ? true : undefined}
              aria-describedby={describedBy(errorOf("occurredOn") && ids.dateError)}
              className="input"
            />
            <FieldError id={ids.dateError} message={errorOf("occurredOn")} />
          </div>
          <FormError state={state} />
          <Buttons submit="Registrar pago" pending="Registrando…" busy={busy} />
        </form>
      )}
    </Dialog>
  );
}
