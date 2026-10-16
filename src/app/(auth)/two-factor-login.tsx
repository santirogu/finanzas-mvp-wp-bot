"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { TOTP_CODE_MESSAGES, type FieldMessages } from "@/lib/field-errors";

type Mode = "totp" | "backup";

/**
 * Segundo paso del login para quien tiene la verificación en dos pasos (solo admins): el código de
 * Google Authenticator o, si no tiene el celular, uno de sus códigos de respaldo (cada uno sirve una
 * vez). Better Auth guarda el primer paso en una cookie que dura 10 minutos.
 */
// Los errores del campo del código, en español (en vez del globo del navegador).
const TOTP_MESSAGES: Record<string, FieldMessages> = { code: TOTP_CODE_MESSAGES };
const BACKUP_MESSAGES: Record<string, FieldMessages> = { code: { required: "Escribe uno de tus códigos de respaldo." } };

export function TwoFactorLogin({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("totp");
  const { errors, reset, formProps } = useFieldErrors(mode === "totp" ? TOTP_MESSAGES : BACKUP_MESSAGES);
  const codeErrorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    startTransition(async () => {
      const { error } =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({ code })
          : await authClient.twoFactor.verifyBackupCode({ code });
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="card w-full max-w-sm p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Verificación en dos pasos</h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "totp"
          ? "Abre Google Authenticator y escribe el código de 6 dígitos de Finanzas MVP."
          : "Escribe uno de los códigos de respaldo que guardaste. Cada uno sirve una sola vez."}
      </p>

      <form method="post" onSubmit={onSubmit} {...formProps} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{mode === "totp" ? "Código de 6 dígitos" : "Código de respaldo"}</span>
            <input
              key={mode}
              name="code"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode={mode === "totp" ? "numeric" : "text"}
              pattern={mode === "totp" ? "\\s*(\\d\\s*){6}" : undefined}
              maxLength={mode === "totp" ? 7 : 11}
              aria-invalid={Boolean(errors.code) || undefined}
              aria-describedby={describedBy(errors.code && codeErrorId)}
              className="input font-mono tracking-widest"
            />
          </label>
          <FieldError id={codeErrorId} message={errors.code} />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Verificando…" : "Verificar"}
        </button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          className="font-medium text-brand"
          onClick={() => {
            setMode(mode === "totp" ? "backup" : "totp");
            reset();
            setError(null);
          }}
        >
          {mode === "totp" ? "No tengo el celular: usar un código de respaldo" : "Usar Google Authenticator"}
        </button>
        <button type="button" className="text-muted hover:text-foreground" onClick={onCancel}>
          Volver a iniciar sesión
        </button>
      </div>
    </div>
  );
}
