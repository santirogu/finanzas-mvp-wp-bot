"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTransactionAction, type FormState } from "@/modules/transactions/actions";

type CategoryOption = { id: string; name: string; emoji: string };

export function TransactionForm({
  type,
  categories,
  today,
}: {
  type: "income" | "expense";
  categories: CategoryOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createTransactionAction,
    { ok: false },
  );
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) amountRef.current?.focus();
  }, [state]);

  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const isIncome = type === "income";

  return (
    <form action={formAction} className="card space-y-4 p-4 sm:p-5">
      <h2 className="font-semibold">{isIncome ? "Nuevo ingreso" : "Nuevo egreso"}</h2>
      <input type="hidden" name="type" value={type} />

      <Field label="Monto" error={errors.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
            $
          </span>
          <input
            ref={amountRef}
            name="amount"
            inputMode="numeric"
            placeholder="500.000"
            defaultValue={values.amount}
            required
            className="input pl-7 tabular-nums"
            onChange={(e) => {
              // Muestra separadores de miles mientras se escribe: 500000 → 500.000
              const digits = e.target.value.replace(/\D/g, "");
              e.target.value = digits ? Number(digits).toLocaleString("es-CO") : "";
            }}
          />
        </div>
      </Field>

      <Field label="Descripción" error={errors.description}>
        <input
          name="description"
          required
          maxLength={140}
          defaultValue={values.description}
          placeholder={isIncome ? "Pago de nómina" : "Zapatos"}
          className="input"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría" error={errors.categoryId}>
          {/* key: React 19 reinicia el formulario al terminar la acción y un <select> no toma un
              defaultValue nuevo después de montarse; con la key se vuelve a montar con la
              categoría que había elegido la persona (si no, tras un error volvería a "Sin
              categoría"). */}
          <select
            key={values.categoryId ?? ""}
            name="categoryId"
            className="input"
            defaultValue={values.categoryId ?? ""}
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha" error={errors.occurredOn}>
          <input name="occurredOn" type="date" defaultValue={values.occurredOn ?? today} max={today} required className="input" />
        </Field>
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Guardando…" : isIncome ? "Registrar ingreso" : "Registrar egreso"}
      </button>

      <p aria-live="polite" className="min-h-5 text-center text-sm text-income">
        {state.ok ? `✓ ${state.message}` : ""}
      </p>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error && <span className="block text-xs text-expense">{error}</span>}
    </label>
  );
}
