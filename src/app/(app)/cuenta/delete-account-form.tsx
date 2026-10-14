"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction, type DeleteAccountState } from "@/modules/account/actions";
import { CONFIRMATION_WORD } from "@/modules/account/confirmation";

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccountAction,
    {},
  );
  const [confirmation, setConfirmation] = useState("");
  const confirmed = confirmation.trim().toUpperCase() === CONFIRMATION_WORD;
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Tu contraseña</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
        {errors.password && <span className="block text-xs text-expense">{errors.password}</span>}
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Escribe <strong>{CONFIRMATION_WORD}</strong> para confirmar
        </span>
        <input
          name="confirmation"
          required
          autoComplete="off"
          className="input"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        {errors.confirmation && (
          <span className="block text-xs text-expense">{errors.confirmation}</span>
        )}
      </label>

      {state.error && (
        <p role="alert" className="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={!confirmed || pending}
        className="w-full rounded-lg bg-expense px-4 py-2.5 font-medium text-white transition hover:bg-expense/90 disabled:opacity-50"
      >
        {pending ? "Eliminando…" : "Eliminar mi cuenta para siempre"}
      </button>
    </form>
  );
}
