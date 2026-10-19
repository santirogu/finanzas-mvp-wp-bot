"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { TOTP_CODE_MESSAGES, type FieldMessages } from "@/lib/field-errors";
import { changePasswordAction, type ChangePasswordState } from "@/modules/account/actions";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type PasswordChangeField } from "@/modules/account/password-change";

// Los errores de los campos antes de enviar, en español (en vez del globo del navegador).
const tooShort = (min: number) => `Debe tener al menos ${min} caracteres.`;
const MESSAGES: Record<string, FieldMessages> = {
  current: { required: "Escribe tu contraseña actual." },
  next: { required: "Escribe la contraseña nueva.", tooShort },
  repeat: { required: "Repite la contraseña nueva.", tooShort },
  code: TOTP_CODE_MESSAGES,
};

/**
 * "Seguridad" en Mi cuenta: cambiar la contraseña. El formulario se abre ahí mismo (y se cierra con
 * Cancelar, que devuelve el foco al botón). `needsCode`: un admin con la verificación en dos pasos
 * también escribe su código (lo decide el servidor; el servidor lo vuelve a validar).
 */
export function ChangePassword({ needsCode }: { needsCode: boolean }) {
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
        Seguridad
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Contraseña</p>
          <p className="text-muted">Al cambiarla se cierran tus otras sesiones.</p>
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
            Cambiar contraseña
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
            toast({ tone: "success", message: "Se cambió tu contraseña. Cerramos tus otras sesiones.", focus: true });
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
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(async (prev, formData) => {
    const result = await changePasswordAction(prev, formData);
    if (result.ok) onDone();
    return result;
  }, {});
  const { errors, formProps } = useFieldErrors(MESSAGES);
  const errorOf = (name: PasswordChangeField) => errors[name] ?? state.fieldErrors?.[name];
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  return (
    <form id={id} action={formAction} {...formProps} className="space-y-4 border-t border-border pt-3">
      <PasswordField ref={first} name="current" label="Contraseña actual" autoComplete="current-password" error={errorOf("current")} />
      <PasswordField
        name="next"
        label="Contraseña nueva"
        hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        error={errorOf("next")}
      />
      <PasswordField
        name="repeat"
        label="Repite la contraseña nueva"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        error={errorOf("repeat")}
      />
      {needsCode && <CodeInput error={errorOf("code")} />}

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
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary min-h-11 pointer-fine:min-h-9">
          {pending ? "Guardando…" : "Guardar contraseña"}
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
function CodeInput({ error }: { error?: string }) {
  const errorId = useId();
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="font-medium">Código de Google Authenticator</span>
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
