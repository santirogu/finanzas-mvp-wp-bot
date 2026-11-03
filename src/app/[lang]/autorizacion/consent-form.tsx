"use client";

import { useActionState, useId } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import type { FieldMessages } from "@/lib/field-errors";
import { acceptPrivacyAction, type PrivacyConsentState } from "@/modules/account/actions";

const TEXTS = texts(
  {
    messages: { privacy: { required: "Para seguir, marca la casilla de la autorización." } } as Record<string, FieldMessages>,
    label: "Soy mayor de 18 años y autorizo el tratamiento de mis datos personales según la política de privacidad.",
    accept: "Aceptar y continuar",
    pending: "Un momento…",
  },
  {
    en: {
      messages: { privacy: { required: "To continue, check the authorization box." } },
      label: "I'm 18 or older and I authorize the processing of my personal data under the privacy policy.",
      accept: "Accept and continue",
      pending: "One moment…",
    },
  },
);

/** La casilla de la autorización (expresa: sin marcarla no se guarda, aquí ni en el servidor) y el botón para darla. */
export function ConsentForm() {
  const [state, formAction, pending] = useActionState<PrivacyConsentState, FormData>(acceptPrivacyAction, {});
  const t = TEXTS[useLocale()];
  const { errors, formProps } = useFieldErrors(t.messages);
  const errorId = useId();
  const error = errors.privacy ?? state.error;

  return (
    <form action={formAction} {...formProps} className="space-y-4 border-t border-border pt-4">
      <div className="space-y-1.5">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="privacy"
            required
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy(error && errorId)}
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand"
          />
          <span>{t.label}</span>
        </label>
        <FieldError id={errorId} message={error} />
      </div>
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? t.pending : t.accept}
      </button>
    </form>
  );
}
