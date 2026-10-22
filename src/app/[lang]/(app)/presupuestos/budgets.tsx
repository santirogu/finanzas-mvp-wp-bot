"use client";

import { useActionState, useId, useState } from "react";
import { BudgetBar } from "@/components/budget-bar";
import { Buttons, Dialog, FormError } from "@/components/dialog";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale, useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import type { FieldMessages } from "@/lib/field-errors";
import { completeAmountDecimals, formatAmountTyping } from "@/lib/money";
import { type BudgetState, removeBudgetAction, saveBudgetAction } from "@/modules/budgets/actions";
import type { BudgetRow } from "@/modules/budgets/progress";

const TEXTS = texts(
  {
    progress: (month: string) => `Cómo vas en ${month}`,
    empty: "Todavía no tienes presupuestos. Agrega uno para ver cuánto te queda de cada categoría en el mes.",
    add: "Agregar un presupuesto",
    category: "Categoría",
    pick: "Elige una categoría",
    amount: "Monto por mes",
    every: "Vale todos los meses hasta que lo cambies o lo quites.",
    save: "Guardar",
    saving: "Guardando…",
    change: "Cambiar",
    changeName: (name: string) => `Cambiar el presupuesto de ${name}`,
    remove: "Quitar",
    removeName: (name: string) => `Quitar el presupuesto de ${name}`,
    removing: "Quitando…",
    messages: {
      categoryId: { required: "Elige una categoría." },
      amount: { required: "Escribe el monto." },
    } as Record<string, FieldMessages>,
  },
  {
    en: {
      progress: (month) => `How you're doing in ${month}`,
      empty: "You don't have budgets yet. Add one to see how much you have left in each category this month.",
      add: "Add a budget",
      category: "Category",
      pick: "Choose a category",
      amount: "Amount per month",
      every: "It applies every month until you change or remove it.",
      save: "Save",
      saving: "Saving…",
      change: "Change",
      changeName: (name) => `Change the ${name} budget`,
      remove: "Remove",
      removeName: (name) => `Remove the ${name} budget`,
      removing: "Removing…",
      messages: {
        categoryId: { required: "Choose a category." },
        amount: { required: "Enter the amount." },
      },
    },
  },
);

type CategoryOption = { id: string; name: string; emoji: string };

/**
 * /presupuestos: cómo va cada presupuesto este mes, con "Cambiar" (el monto) y "Quitar", y "Agregar un presupuesto"
 * con las categorías que todavía no tienen.
 */
export function Budgets({ rows, options, month }: { rows: BudgetRow[]; options: CategoryOption[]; month: string }) {
  const t = useTexts(TEXTS);
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="como-vas" className="card p-4">
      <h2 id="como-vas" className="font-semibold">
        {t.progress(month)}
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row) => (
            <BudgetItem key={row.categoryId} row={row} />
          ))}
        </ul>
      )}
      {options.length > 0 && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-background pointer-fine:min-h-8"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          {t.add}
        </button>
      )}
      {adding && <BudgetDialog title={t.add} options={options} onClose={() => setAdding(false)} />}
    </section>
  );
}

/** Un presupuesto de la lista: su barra, "Cambiar" (abre la ventana del monto) y "Quitar". */
function BudgetItem({ row }: { row: BudgetRow }) {
  const t = useTexts(TEXTS);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [state, removeAction, removing] = useActionState<BudgetState, FormData>(async (prev, formData) => {
    const result = await removeBudgetAction(prev, formData);
    // La fila se va: el aviso recibe el foco.
    if (result.message && result.tone) toast({ tone: result.tone, message: result.message, focus: true });
    return result;
  }, {});
  return (
    <li className="py-3">
      <BudgetBar row={row} />
      <div className="mt-1 flex flex-wrap items-center gap-x-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t.changeName(row.name)}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand pointer-fine:min-h-7"
        >
          {t.change}
        </button>
        <form action={removeAction}>
          <input type="hidden" name="categoryId" value={row.categoryId} />
          <button
            type="submit"
            disabled={removing}
            aria-label={t.removeName(row.name)}
            className="inline-flex min-h-11 items-center text-sm font-medium text-danger disabled:opacity-60 pointer-fine:min-h-7"
          >
            {removing ? t.removing : t.remove}
          </button>
        </form>
      </div>
      {state.error && (
        <span role="alert" className="block text-xs text-danger">
          {state.error}
        </span>
      )}
      {editing && <BudgetDialog title={t.changeName(row.name)} row={row} onClose={() => setEditing(false)} />}
    </li>
  );
}

/**
 * La ventana de un presupuesto: con `row`, cambia el monto de ese; si no, uno nuevo, con la categoría (de `options`)
 * y el monto. Con éxito se cierra y el aviso verde recibe el foco.
 */
function BudgetDialog({ title, row, options = [], onClose }: { title: string; row?: BudgetRow; options?: CategoryOption[]; onClose: () => void }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const toast = useToast();
  const ids = { category: useId(), categoryError: useId(), amount: useId(), amountError: useId() };
  const { errors, formProps } = useFieldErrors(t.messages);
  // Con un error, lo que escribió la persona: React vacía el formulario al terminar la acción.
  const [state, formAction, busy] = useActionState<BudgetState & { values?: Record<string, string> }, FormData>(async (prev, formData) => {
    const result = await saveBudgetAction(prev, formData);
    if (result.message && result.tone) {
      toast({ tone: result.tone, message: result.message, focus: true });
      onClose();
      return result;
    }
    return { ...result, values: { categoryId: String(formData.get("categoryId") ?? ""), amount: String(formData.get("amount") ?? "") } };
  }, {});
  const errorOf = (field: "categoryId" | "amount") => errors[field] ?? (state.field === field ? state.error : undefined);
  return (
    <Dialog title={title} onClose={onClose}>
      {(dialog) => (
        <form action={formAction} {...formProps} className="space-y-4 text-sm">
          <p id={dialog.description} className="text-muted">
            {t.every}
          </p>
          {row ? (
            <input type="hidden" name="categoryId" value={row.categoryId} />
          ) : (
            <div className="space-y-1.5">
              <label htmlFor={ids.category} className="block font-medium">
                {t.category}
              </label>
              <select
                key={state.values?.categoryId ?? ""}
                id={ids.category}
                name="categoryId"
                required
                autoFocus
                defaultValue={state.values?.categoryId ?? ""}
                aria-invalid={errorOf("categoryId") ? true : undefined}
                aria-describedby={describedBy(errorOf("categoryId") && ids.categoryError)}
                className="input w-full"
              >
                <option value="" disabled>
                  {t.pick}
                </option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.emoji} {option.name}
                  </option>
                ))}
              </select>
              <FieldError id={ids.categoryError} message={errorOf("categoryId")} />
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor={ids.amount} className="block font-medium">
              {t.amount}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-muted pointer-fine:text-sm">$</span>
              <input
                id={ids.amount}
                name="amount"
                inputMode="decimal"
                required
                autoFocus={Boolean(row)}
                defaultValue={state.values?.amount ?? row?.amountInput}
                aria-invalid={errorOf("amount") ? true : undefined}
                aria-describedby={describedBy(errorOf("amount") && ids.amountError)}
                className="input pl-7 tabular-nums"
                onChange={(event) => {
                  // Puntos de miles mientras se escribe y, tras la coma, hasta dos centavos (como en Egresos).
                  event.target.value = formatAmountTyping(event.target.value, locale);
                }}
                onBlur={(event) => {
                  event.target.value = completeAmountDecimals(event.target.value, locale);
                }}
              />
            </div>
            <FieldError id={ids.amountError} message={errorOf("amount")} />
          </div>
          <FormError state={state} />
          <Buttons submit={t.save} pending={t.saving} busy={busy} />
        </form>
      )}
    </Dialog>
  );
}
