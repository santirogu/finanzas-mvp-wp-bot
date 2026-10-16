"use client";

import { useActionState, useId, useState } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import type { FieldMessages } from "@/lib/field-errors";
import { deleteAccountAction, type DeleteAccountState } from "@/modules/account/actions";
import { CONFIRMATION_WORD } from "@/modules/account/confirmation";

// Los errores de los campos antes de enviar, en español (en vez del globo del navegador).
const MESSAGES: Record<string, FieldMessages> = {
  password: { required: "Escribe tu contraseña." },
  confirmation: { required: `Escribe ${CONFIRMATION_WORD} para confirmar.` },
};

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccountAction,
    {},
  );
  const [confirmation, setConfirmation] = useState("");
  const confirmed = confirmation.trim().toUpperCase() === CONFIRMATION_WORD;
  // Los del navegador (antes de enviar, en español) y, si no hay, los del servidor.
  const { errors: fieldErrors, formProps } = useFieldErrors(MESSAGES);
  const errorOf = (name: "password" | "confirmation") => fieldErrors[name] ?? state.fieldErrors?.[name];
  const passwordErrorId = useId();
  const confirmationErrorId = useId();

  return (
    <form action={formAction} {...formProps} className="space-y-4">
      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Tu contraseña</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={Boolean(errorOf("password")) || undefined}
            aria-describedby={describedBy(errorOf("password") && passwordErrorId)}
            className="input"
          />
        </label>
        <FieldError id={passwordErrorId} message={errorOf("password")} />
      </div>
      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            Escribe <strong>{CONFIRMATION_WORD}</strong> para confirmar
          </span>
          <input
            name="confirmation"
            required
            autoComplete="off"
            aria-invalid={Boolean(errorOf("confirmation")) || undefined}
            aria-describedby={describedBy(errorOf("confirmation") && confirmationErrorId)}
            className="input"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        <FieldError id={confirmationErrorId} message={errorOf("confirmation")} />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={!confirmed || pending}
        className="btn-danger w-full"
      >
        {pending ? "Eliminando…" : "Eliminar mi cuenta para siempre"}
      </button>
    </form>
  );
}
