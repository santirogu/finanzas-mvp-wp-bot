"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { BRAND_NAME } from "@/lib/brand";
import { FIELD_TEXTS, type FieldMessages } from "@/lib/field-errors";

type Mode = "totp" | "backup";

/**
 * Segundo paso del login para quien tiene la verificación en dos pasos (solo admins): el código de
 * Google Authenticator o, si no tiene el celular, uno de sus códigos de respaldo (cada uno sirve una
 * vez). Better Auth guarda el primer paso en una cookie que dura 10 minutos.
 */
const TEXTS = texts(
  {
    // Los errores del campo del código (en vez del globo del navegador).
    totpMessages: { code: FIELD_TEXTS.es.totpCode } as Record<string, FieldMessages>,
    backupMessages: { code: { required: "Escribe uno de tus códigos de respaldo." } } as Record<string, FieldMessages>,
    title: "Verificación en dos pasos",
    totpIntro: `Abre Google Authenticator y escribe el código de 6 dígitos de ${BRAND_NAME} (antes, Finanzas MVP).`,
    backupIntro: "Escribe uno de los códigos de respaldo que guardaste. Cada uno sirve una sola vez.",
    totpLabel: "Código de 6 dígitos",
    backupLabel: "Código de respaldo",
    submit: "Verificar",
    pending: "Verificando…",
    useBackup: "No tengo el celular: usar un código de respaldo",
    useTotp: "Usar Google Authenticator",
    back: "Volver a iniciar sesión",
  },
  {
    en: {
      totpMessages: { code: FIELD_TEXTS.en.totpCode },
      backupMessages: { code: { required: "Enter one of your backup codes." } },
      title: "Two-step verification",
      totpIntro: `Open Google Authenticator and enter the 6-digit code for ${BRAND_NAME} (formerly Finanzas MVP).`,
      backupIntro: "Enter one of the backup codes you saved. Each one works only once.",
      totpLabel: "6-digit code",
      backupLabel: "Backup code",
      submit: "Verify",
      pending: "Verifying…",
      useBackup: "I don't have my phone: use a backup code",
      useTotp: "Use Google Authenticator",
      back: "Back to sign in",
    },
  },
);

export function TwoFactorLogin({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("totp");
  const locale = useLocale();
  const t = TEXTS[locale];
  const { errors, reset, formProps } = useFieldErrors(mode === "totp" ? t.totpMessages : t.backupMessages);
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
        setError(authErrorMessage(error, locale));
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="card w-full max-w-sm p-6 sm:p-8">
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="mt-1 text-sm text-muted">{mode === "totp" ? t.totpIntro : t.backupIntro}</p>

      <form method="post" onSubmit={onSubmit} {...formProps} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{mode === "totp" ? t.totpLabel : t.backupLabel}</span>
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
          {pending ? t.pending : t.submit}
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
          {mode === "totp" ? t.useBackup : t.useTotp}
        </button>
        <button type="button" className="text-muted hover:text-foreground" onClick={onCancel}>
          {t.back}
        </button>
      </div>
    </div>
  );
}
