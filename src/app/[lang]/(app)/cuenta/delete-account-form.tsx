"use client";

import { useActionState, useId, useState } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import type { FieldMessages } from "@/lib/field-errors";
import { deleteAccountAction, type DeleteAccountState } from "@/modules/account/actions";
import { CONFIRMATION_WORDS } from "@/modules/account/confirmation";

const TEXTS = texts(
  {
    // Los errores de los campos antes de enviar (en vez del globo del navegador).
    messages: {
      password: { required: "Escribe tu contraseña." },
      confirmation: { required: `Escribe ${CONFIRMATION_WORDS.es} para confirmar.` },
    } as Record<string, FieldMessages>,
    password: "Tu contraseña",
    type: "Escribe",
    toConfirm: "para confirmar",
    deleting: "Eliminando…",
    delete: "Eliminar mi cuenta para siempre",
  },
  {
    en: {
      messages: {
        password: { required: "Enter your password." },
        confirmation: { required: `Type ${CONFIRMATION_WORDS.en} to confirm.` },
      },
      password: "Your password",
      type: "Type",
      toConfirm: "to confirm",
      deleting: "Deleting…",
      delete: "Delete my account forever",
    },
  },
);

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccountAction,
    {},
  );
  const locale = useLocale();
  const t = TEXTS[locale];
  const word = CONFIRMATION_WORDS[locale];
  const [confirmation, setConfirmation] = useState("");
  const confirmed = confirmation.trim().toUpperCase() === word;
  // Los del navegador (antes de enviar) y, si no hay, los del servidor.
  const { errors: fieldErrors, formProps } = useFieldErrors(t.messages);
  const errorOf = (name: "password" | "confirmation") => fieldErrors[name] ?? state.fieldErrors?.[name];
  const passwordErrorId = useId();
  const confirmationErrorId = useId();

  return (
    <form action={formAction} {...formProps} className="space-y-4">
      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t.password}</span>
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
            {t.type} <strong>{word}</strong> {t.toConfirm}
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
        {pending ? t.deleting : t.delete}
      </button>
    </form>
  );
}
