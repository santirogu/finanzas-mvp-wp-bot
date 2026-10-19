"use client";

import { type ReactNode, useActionState, useId, useRef, useState } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { formatMoney, formatShare } from "@/lib/money";
import { chooseFixedExpenseAction, type FixedExpenseState } from "@/modules/reports/actions";
import { type FixedOption, RECURRING_MIN_MONTHS, RECURRING_WINDOW, type RecurringExpense } from "@/modules/reports/recurring";

// El error del selector antes de enviar, en español (en vez del globo del navegador).
const MESSAGES = { description: { required: "Elige un egreso." } };

/**
 * "Gastos fijos" de Reportes: los que se detectaron solos y los que agregó la persona. Cada uno se puede
 * quitar (✕); los detectados que se quitaron quedan en "Quitados", de donde se pueden volver a poner, y
 * "Agregar un gasto fijo" suma uno de los egresos del período. Cada cambio vale para todos los períodos y
 * avisa abajo (verde si el gasto queda, rojo si sale), con el foco: lo que se tocó ya no está ahí.
 */
export function FixedExpenses({
  items,
  removed,
  candidates,
  total,
  periodMonths,
  averageExpense,
  currency,
}: {
  items: RecurringExpense[];
  removed: FixedOption[];
  candidates: FixedOption[];
  /** Lo que suman al mes. */
  total: number;
  /** Cuántos meses tiene el período ("En 4 de 12 meses"). */
  periodMonths: number;
  /** El gasto promedio por mes del período; 0 si no hay. */
  averageExpense: number;
  currency: string;
}) {
  const money = (n: number) => formatMoney(n, currency);
  return (
    <section className="card p-4" aria-label="Gastos fijos">
      <h2 className="font-semibold">Gastos fijos</h2>
      <p className="mt-1 text-sm text-muted">
        Los egresos con la misma descripción en al menos {RECURRING_MIN_MONTHS} de los últimos {RECURRING_WINDOW} meses, y los que agregaste tú.
      </p>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Todavía no hay egresos que se repitan cada mes.</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border">
            {items.map((item) => (
              <li key={item.key} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span aria-hidden>{item.emoji} </span>
                    {item.description}
                  </p>
                  <p className="text-xs text-muted">
                    En {item.months} de {periodMonths} {periodMonths === 1 ? "mes" : "meses"}
                    {item.origin === "manual" && " · Agregado por ti"}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-expense">−{money(item.amount)}</span>
                {/* Uno detectado pasa a "Quitados"; uno agregado a mano, simplemente sale. */}
                <ChoiceForm description={item.description} action={item.origin === "manual" ? "unadd" : "exclude"}>
                  {(busy) => (
                    <button
                      type="submit"
                      disabled={busy}
                      aria-label={`Quitar ${item.description} de los gastos fijos`}
                      title="Quitar de los gastos fijos"
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-60 pointer-fine:size-8"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </button>
                  )}
                </ChoiceForm>
              </li>
            ))}
          </ul>
          {/* El total, alineado con los montos de arriba (deja el lugar del ✕: 44 px, o 32 con mouse, más el espacio). */}
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 pr-[3.25rem] text-sm font-semibold pointer-fine:pr-10">
            <span>Total al mes</span>
            <span className="whitespace-nowrap tabular-nums">−{money(total)}</span>
          </div>
          {averageExpense > 0 && <p className="mt-1 text-xs text-muted">Son el {formatShare(total, averageExpense)}% de tu gasto promedio por mes.</p>}
        </>
      )}
      {candidates.length > 0 && <AddFixedExpense candidates={candidates} />}
      {removed.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand pointer-fine:min-h-8">
            Quitados ({removed.length})
          </summary>
          <ul className="divide-y divide-border">
            {removed.map((option) => (
              <li key={option.key} className="flex items-center gap-3 py-2">
                <p className="min-w-0 flex-1 truncate">
                  <span aria-hidden>{option.emoji} </span>
                  {option.description}
                </p>
                <ChoiceForm description={option.description} action="restore">
                  {(busy) => (
                    <button
                      type="submit"
                      disabled={busy}
                      aria-label={`Volver a poner ${option.description} en los gastos fijos`}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-background disabled:opacity-60 pointer-fine:min-h-8"
                    >
                      {busy ? "Volviendo…" : "Volver a poner"}
                    </button>
                  )}
                </ChoiceForm>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Con éxito, el aviso emergente (verde o rojo) con el foco; un error queda al lado del botón. */
function useChoice(onDone?: () => void) {
  const toast = useToast();
  return useActionState<FixedExpenseState, FormData>(async (prev, formData) => {
    const result = await chooseFixedExpenseAction(prev, formData);
    if (result.message && result.tone) {
      onDone?.();
      toast({ tone: result.tone, message: result.message, focus: true });
    }
    return result;
  }, {});
}

/** Un botón que manda una marca (quitar o volver a poner) de un gasto. */
function ChoiceForm({
  description,
  action,
  children,
}: {
  description: string;
  action: "exclude" | "restore" | "unadd";
  children: (busy: boolean) => ReactNode;
}) {
  const [state, formAction, busy] = useChoice();
  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end">
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="action" value={action} />
      {children(busy)}
      {state.error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** "Agregar un gasto fijo": elegir uno de los egresos del período (uno que todavía lleva pocos meses). */
function AddFixedExpense({ candidates }: { candidates: FixedOption[] }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const fieldId = useId();
  const errorId = useId();
  const { errors, formProps } = useFieldErrors(MESSAGES);
  const [state, formAction, busy] = useChoice(() => setOpen(false));
  const close = () => {
    setOpen(false);
    // El foco vuelve al botón que abrió el formulario (cuando vuelve a aparecer).
    setTimeout(() => opener.current?.focus());
  };
  const error = errors.description ?? state.error;

  if (!open) {
    return (
      <button
        ref={opener}
        type="button"
        aria-expanded={false}
        aria-controls={formId}
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-background pointer-fine:min-h-8"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
        </svg>
        Agregar un gasto fijo
      </button>
    );
  }

  return (
    <form id={formId} action={formAction} {...formProps} className="mt-3 space-y-2 border-t border-border pt-3">
      <input type="hidden" name="action" value="include" />
      <label htmlFor={fieldId} className="block text-sm font-medium">
        Egreso
      </label>
      {/* Con el foco al abrirse: es lo único que hay que elegir. */}
      <select
        id={fieldId}
        name="description"
        required
        autoFocus
        defaultValue=""
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(error && errorId)}
        className="input w-full"
      >
        <option value="" disabled>
          Elige un egreso del período
        </option>
        {candidates.map((option) => (
          <option key={option.key} value={option.description}>
            {option.emoji} {option.description}
          </option>
        ))}
      </select>
      <FieldError id={errorId} message={error} />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-background pointer-fine:min-h-8"
        >
          Cancelar
        </button>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Agregando…" : "Agregar"}
        </button>
      </div>
    </form>
  );
}
