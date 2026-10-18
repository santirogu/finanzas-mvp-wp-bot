"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { formatMonthName, monthOf } from "@/lib/dates";
import type { FieldMessages } from "@/lib/field-errors";
import { amountInputValue, completeAmountDecimals, formatAmountTyping } from "@/lib/money";
import {
  createTransactionAction,
  updateTransactionAction,
  type FormState,
} from "@/modules/transactions/actions";
import { type Suggestion, useDescriptionSuggestions } from "./description-suggestions";
import { describedBy, FieldError } from "./field-error";
import { useToast } from "./toaster";
import { useFieldErrors } from "./use-field-errors";

type CategoryOption = { id: string; name: string; emoji: string; archived?: boolean };

/** Una descripción que la persona ya usó, con la categoría de la última vez (src/modules/transactions/queries.ts). */
export type DescriptionSuggestion = Suggestion;

/** Movimiento a editar; sin él, el formulario registra uno nuevo. */
export type TransactionToEdit = {
  id: string;
  amount: number;
  description: string;
  categoryId: string | null;
  occurredOn: string;
};

// Los errores de los campos antes de enviar, en español (en vez del globo del navegador).
const MESSAGES: Record<string, FieldMessages> = {
  amount: { required: "Escribe el monto." },
  description: { required: 'Escribe una descripción, por ejemplo "Almuerzo".' },
  occurredOn: { required: "Elige la fecha.", max: "La fecha no puede ser después de hoy." },
};

export function TransactionForm({
  type,
  categories,
  today,
  defaultDate = today,
  transaction,
  cancelHref,
  listMonth,
  suggestions = [],
}: {
  type: "income" | "expense";
  categories: CategoryOption[];
  /** El límite de la fecha (no se registran movimientos futuros). */
  today: string;
  /** La fecha que propone un movimiento nuevo: hoy o, mirando otro mes, el mismo día de ese mes. */
  defaultDate?: string;
  transaction?: TransactionToEdit;
  /** Adónde vuelve "Cancelar" al editar. */
  cancelHref?: string;
  /**
   * El mes de la lista de al lado (YYYY-MM-DD, el primero inclusive y el del mes siguiente). Si el
   * movimiento nuevo cae en otro mes, no aparece en ella: el aviso dice en cuál quedó.
   */
  listMonth?: { start: string; end: string };
  /** Lo que se sugiere al escribir la descripción (solo al registrar uno nuevo). */
  suggestions?: DescriptionSuggestion[];
}) {
  const editing = Boolean(transaction);
  // Al editar, si se guarda bien, la Server Action redirige a la lista.
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    editing ? updateTransactionAction : createTransactionAction,
    { ok: false },
  );
  const amountRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  // El aviso de cada registro, una sola vez (la página se vuelve a renderizar con el mismo resultado,
  // p. ej. al cambiar de mes).
  const announced = useRef<FormState | null>(null);
  const descriptionSuggestions = useDescriptionSuggestions({
    suggestions,
    categories,
    onPick: (suggestion) => proposeCategoryFor(suggestion.description),
  });
  const resetSuggestions = descriptionSuggestions.reset;
  // La categoría que propone una descripción conocida, salvo que la persona ya haya elegido una a mano.
  const categoryRef = useRef<HTMLSelectElement>(null);
  const categoryChosen = useRef(false);
  const [proposed, setProposed] = useState("");
  /** Pone la categoría de la última vez de una descripción conocida (si no la eligió a mano). */
  function proposeCategoryFor(text: string) {
    const category = proposedCategory(text, suggestions, categories);
    if (!category || categoryChosen.current || !categoryRef.current) return;
    categoryRef.current.value = category.id;
    setProposed(`Se eligió la categoría ${category.name}, la de la última vez.`);
  }

  useEffect(() => {
    if (!state.ok || announced.current === state) return;
    announced.current = state;
    categoryChosen.current = false;
    setProposed("");
    resetSuggestions();
    amountRef.current?.focus();
    toast({ tone: "success", message: `${state.message}${elsewhere(state.occurredOn, listMonth)}` });
  }, [state, toast, listMonth, resetSuggestions]);

  // Los del navegador (antes de enviar, en español) y, si no hay, los del servidor.
  const { errors: fieldErrors, formProps } = useFieldErrors(MESSAGES);
  const serverErrors = state.fieldErrors ?? {};
  const errorOf = (name: keyof NonNullable<FormState["fieldErrors"]>) => fieldErrors[name] ?? serverErrors[name];
  const ids = { amount: useId(), description: useId(), categoryId: useId(), occurredOn: useId() };
  const aria = (name: keyof typeof ids) => ({
    "aria-invalid": Boolean(errorOf(name)) || undefined,
    "aria-describedby": describedBy(errorOf(name) && ids[name]),
  });
  // Lo que devolvió el servidor tras un error; si no, los datos del movimiento que se edita.
  const values = state.values ?? (transaction ? valuesOf(transaction) : {});
  const isIncome = type === "income";
  const noun = isIncome ? "ingreso" : "egreso";

  return (
    <form action={formAction} {...formProps} className="card space-y-4 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{editing ? `Editar ${noun}` : `Nuevo ${noun}`}</h2>
        {/* La explicación del asterisco, solo a la vista: el lector de pantalla ya anuncia cada campo
            obligatorio. */}
        <p aria-hidden className="text-xs text-muted">
          <RequiredMark /> Obligatorio
        </p>
      </div>
      <input type="hidden" name="type" value={type} />
      {transaction && <input type="hidden" name="id" value={transaction.id} />}

      <Field label="Monto" required error={errorOf("amount")} errorId={ids.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-muted pointer-fine:text-sm">
            $
          </span>
          <input
            ref={amountRef}
            name="amount"
            inputMode="decimal"
            placeholder="500.000,00"
            defaultValue={values.amount}
            required
            {...aria("amount")}
            className="input pl-7 tabular-nums"
            onChange={(e) => {
              // Puntos de miles mientras se escribe y, tras la coma, hasta dos centavos: 45900,5 → 45.900,5
              e.target.value = formatAmountTyping(e.target.value);
            }}
            onBlur={(e) => {
              // Al salir del campo, con sus dos decimales: 500.000 → 500.000,00 y 45.900,5 → 45.900,50
              e.target.value = completeAmountDecimals(e.target.value);
            }}
          />
        </div>
      </Field>

      <Field
        label="Descripción"
        required
        error={errorOf("description")}
        errorId={ids.description}
        popup={descriptionSuggestions.popup}
      >
        <input
          name="description"
          required
          maxLength={140}
          defaultValue={values.description}
          placeholder={isIncome ? "Pago de nómina" : "Zapatos"}
          {...aria("description")}
          className="input"
          // Las descripciones que ya usó: la lista de abajo (src/components/description-suggestions.tsx).
          {...descriptionSuggestions.inputProps}
          onChange={(e) => proposeCategoryFor(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría" error={errorOf("categoryId")} errorId={ids.categoryId}>
          {/* key: React 19 reinicia el formulario al terminar la acción y un <select> no toma un
              defaultValue nuevo después de montarse; con la key se vuelve a montar con la
              categoría que había elegido la persona (si no, tras un error volvería a "Sin
              categoría"). */}
          <select
            ref={categoryRef}
            key={values.categoryId ?? ""}
            onChange={() => {
              categoryChosen.current = true;
              setProposed("");
            }}
            name="categoryId"
            {...aria("categoryId")}
            className="input"
            defaultValue={values.categoryId ?? ""}
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
                {c.archived && " (archivada)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha" required error={errorOf("occurredOn")} errorId={ids.occurredOn}>
          <input
            name="occurredOn"
            type="date"
            defaultValue={values.occurredOn ?? defaultDate}
            max={today}
            required
            {...aria("occurredOn")}
            className="input"
          />
        </Field>
      </div>

      {/* Cuando una descripción conocida elige la categoría, el lector de pantalla lo dice (el cambio
          se ve, pero no se anuncia). Fuera de las etiquetas, para no cambiar el nombre de los campos. */}
      <p aria-live="polite" className="sr-only">
        {proposed}
      </p>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Guardando…" : editing ? "Guardar cambios" : `Registrar ${noun}`}
      </button>

      {editing && cancelHref && (
        <Link href={cancelHref} className="block text-center text-sm font-medium text-muted">
          Cancelar
        </Link>
      )}

      {/* Los errores que no son de un campo ("No encontramos ese movimiento"); lo que salió bien va en un
          aviso emergente. */}
      <p aria-live="polite" className="min-h-5 text-center text-sm text-danger empty:min-h-0">
        {state.ok ? "" : (state.message ?? "")}
      </p>
    </form>
  );
}

/** " en septiembre de 2026" si el movimiento registrado quedó fuera del mes de la lista; si no, nada. */
function elsewhere(occurredOn: string | undefined, listMonth: { start: string; end: string } | undefined) {
  if (!occurredOn || !listMonth || (occurredOn >= listMonth.start && occurredOn < listMonth.end)) return "";
  return ` en ${formatMonthName(monthOf(occurredOn), { withYear: true })}`;
}

function RequiredMark() {
  return (
    <span aria-hidden className="ml-0.5 text-danger">
      *
    </span>
  );
}

/**
 * La categoría que propone lo escrito en la descripción: si es (sin importar mayúsculas ni espacios)
 * una que ya usó, la de la última vez, siempre que se pueda elegir (no archivada).
 */
function proposedCategory(typed: string, suggestions: DescriptionSuggestion[], categories: CategoryOption[]) {
  const text = typed.trim().toLowerCase();
  const match = text ? suggestions.find((s) => s.description.toLowerCase() === text) : undefined;
  return categories.find((c) => c.id === match?.categoryId && !c.archived) ?? null;
}

/** Valores del formulario a partir de un movimiento guardado (el monto con separadores y sus centavos). */
function valuesOf(transaction: TransactionToEdit): Record<string, string> {
  return {
    amount: amountInputValue(transaction.amount),
    description: transaction.description,
    categoryId: transaction.categoryId ?? "",
    occurredOn: transaction.occurredOn,
  };
}

/**
 * Un campo con su etiqueta y, debajo, su error (fuera de la etiqueta: si no, cambiaría su nombre). Los
 * obligatorios llevan un asterisco rojo; el lector de pantalla no lo lee (ya anuncia "obligatorio"
 * por el `required` del campo).
 */
function Field({
  label,
  required = false,
  error,
  errorId,
  popup,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  errorId: string;
  /** Lo que se abre debajo del campo (las sugerencias): fuera de la etiqueta, para no cambiar su nombre. */
  popup?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          {label}
          {required && <RequiredMark />}
        </span>
        {children}
      </label>
      {popup && <div className="relative !mt-0">{popup}</div>}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
