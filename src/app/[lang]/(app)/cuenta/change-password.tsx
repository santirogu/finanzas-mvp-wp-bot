"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { FIELD_TEXTS, type FieldMessages } from "@/lib/field-errors";
import { changePasswordAction, type ChangePasswordState } from "@/modules/account/actions";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type PasswordChangeField } from "@/modules/account/password-change";

const tooShortEs = (min: number) => `Debe tener al menos ${min} caracteres.`;
const tooShortEn = (min: number) => `It must have at least ${min} characters.`;

const TEXTS = texts(
  {
    // Los errores de los campos antes de enviar (en vez del globo del navegador).
    messages: {
      current: { required: "Escribe tu contraseña actual." },
      next: { required: "Escribe la contraseña nueva.", tooShort: tooShortEs },
      repeat: { required: "Repite la contraseña nueva.", tooShort: tooShortEs },
      code: FIELD_TEXTS.es.totpCode,
    } as Record<string, FieldMessages>,
    security: "Seguridad",
    password: "Contraseña",
    hint: "Al cambiarla se cierran tus otras sesiones.",
    change: "Cambiar contraseña",
    done: "Se cambió tu contraseña. Cerramos tus otras sesiones.",
    current: "Contraseña actual",
    next: "Contraseña nueva",
    min: (n: number) => `Mínimo ${n} caracteres.`,
    repeat: "Repite la contraseña nueva",
    cancel: "Cancelar",
    saving: "Guardando…",
    save: "Guardar contraseña",
    code: "Código de Google Authenticator",
  },
  {
    en: {
      messages: {
        current: { required: "Enter your current password." },
        next: { required: "Enter the new password.", tooShort: tooShortEn },
        repeat: { required: "Repeat the new password.", tooShort: tooShortEn },
        code: FIELD_TEXTS.en.totpCode,
      },
      security: "Security",
      password: "Password",
      hint: "Changing it signs out your other sessions.",
      change: "Change password",
      done: "Your password was changed. We signed out your other sessions.",
      current: "Current password",
      next: "New password",
      min: (n) => `At least ${n} characters.`,
      repeat: "Repeat the new password",
      cancel: "Cancel",
      saving: "Saving…",
      save: "Save password",
      code: "Google Authenticator code",
    },
  },
);

/**
 * "Seguridad" en Mi cuenta: cambiar la contraseña. El formulario se abre ahí mismo (y se cierra con
 * Cancelar, que devuelve el foco al botón). `needsCode`: un admin con la verificación en dos pasos
 * también escribe su código (lo decide el servidor; el servidor lo vuelve a validar).
 */
export function ChangePassword({ needsCode }: { needsCode: boolean }) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  // Al cancelar, el foco vuelve al botón (que recién reaparece).
  const returnFocus = useRef(false);
  const formId = useId();
  const toast = useToast();

  useEffect(() => {
    if (!open && returnFocus.current) {
      toggle.current?.focus();
      returnFocus.current = false;
    }
  }, [open]);

  return (
    <section className="card space-y-3 p-4 text-sm" aria-labelledby="seguridad">
      <h2 id="seguridad" className="font-semibold">
        {t.security}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{t.password}</p>
          <p className="text-muted">{t.hint}</p>
        </div>
        {!open && (
          <button
            ref={toggle}
            type="button"
            aria-expanded={false}
            aria-controls={formId}
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-border px-3 font-medium hover:bg-background pointer-fine:min-h-9"
          >
            {t.change}
          </button>
        )}
      </div>
      {open && (
        <PasswordForm
          id={formId}
          needsCode={needsCode}
          onCancel={() => {
            returnFocus.current = true;
            setOpen(false);
          }}
          onDone={() => {
            setOpen(false);
            // El botón que abrió el formulario reaparece; el foco va al aviso.
            toast({ tone: "success", message: t.done, focus: true });
          }}
        />
      )}
    </section>
  );
}

function PasswordForm({
  id,
  needsCode,
  onCancel,
  onDone,
}: {
  id: string;
  needsCode: boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  const t = useTexts(TEXTS);
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(async (prev, formData) => {
    const result = await changePasswordAction(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});
  const { errors, formProps } = useFieldErrors(t.messages);
  const errorOf = (name: PasswordChangeField) => errors[name] ?? state.fieldErrors?.[name];
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  return (
    <form id={id} action={formAction} {...formProps} className="space-y-4 border-t border-border pt-3">
      <PasswordField ref={first} name="current" label={t.current} autoComplete="current-password" error={errorOf("current")} />
      <PasswordField
        name="next"
        label={t.next}
        hint={t.min(PASSWORD_MIN_LENGTH)}
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        error={errorOf("next")}
      />
      <PasswordField
        name="repeat"
        label={t.repeat}
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        error={errorOf("repeat")}
      />
      {needsCode && <CodeInput label={t.code} error={errorOf("code")} />}

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium hover:bg-background pointer-fine:min-h-9"
        >
          {t.cancel}
        </button>
        <button type="submit" disabled={pending} className="btn-primary min-h-11 pointer-fine:min-h-9">
          {pending ? t.saving : t.save}
        </button>
      </div>
    </form>
  );
}

function PasswordField({
  ref,
  name,
  label,
  hint,
  autoComplete,
  minLength,
  maxLength,
  error,
}: {
  ref?: React.Ref<HTMLInputElement>;
  name: PasswordChangeField;
  label: string;
  hint?: string;
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
  error?: string;
}) {
  const errorId = useId();
  const hintId = useId();
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="font-medium">{label}</span>
        <input
          ref={ref}
          name={name}
          type="password"
          required
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(hint && hintId, error && errorId)}
          className="input"
        />
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/** El código de Google Authenticator de un admin. */
function CodeInput({ label, error }: { label: string; error?: string }) {
  const errorId = useId();
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="font-medium">{label}</span>
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\s*(\d\s*){6}"
          maxLength={7}
          placeholder="000000"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(error && errorId)}
          className="input font-mono tracking-[0.3em]"
        />
      </label>
      <FieldError id={errorId} message={error} />
    </div>
  );
}
