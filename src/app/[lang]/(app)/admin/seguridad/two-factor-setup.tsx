"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { QrCode } from "@/components/qr-code";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { BRAND_NAME } from "@/lib/brand";
import { FIELD_TEXTS, type FieldMessages } from "@/lib/field-errors";
import { manualKeyFromUri } from "@/modules/auth/two-factor-rules";
import { finishTwoFactorSetupAction } from "./actions";

type Step = { name: "password" } | { name: "scan"; totpURI: string; backupCodes: string[] } | { name: "codes"; backupCodes: string[] };

/**
 * Configurar la verificación en dos pasos, una sola vez: (1) confirmar la contraseña, (2) escanear el
 * QR con Google Authenticator y escribir el primer código, (3) guardar los códigos de respaldo.
 */
const TEXTS = texts(
  {
    // Los errores de los campos (en vez del globo del navegador).
    messages: { password: { required: "Escribe tu contraseña." }, code: FIELD_TEXTS.es.totpCode } as Record<string, FieldMessages>,
    startError: "No pudimos empezar la configuración. Intenta de nuevo.",
    step1: "Paso 1 de 3: confirma que eres tú",
    step1Intro: "Necesitas Google Authenticator (o cualquier app de códigos) instalada en tu celular.",
    password: "Tu contraseña",
    wait: "Un momento…",
    next: "Continuar",
    step2: "Paso 2 de 3: escanea el código",
    step2Intro: { tap: "En Google Authenticator toca", scan: "Escanear un código QR", rest: "y apunta la cámara aquí. Luego escribe el código de 6 dígitos que aparece." },
    qr: `Código QR para agregar ${BRAND_NAME} a Google Authenticator`,
    manual: "¿No puedes escanearlo? Elige “Ingresar una clave de configuración” y escribe:",
    manualLabel: "Clave de configuración",
    code: "Código de 6 dígitos",
    verifying: "Verificando…",
    activate: "Activar la verificación",
    step3: "Paso 3 de 3: guarda tus códigos de respaldo",
    done: "✓ La verificación en dos pasos quedó activa y cerramos tus otras sesiones abiertas.",
    backupIntro:
      "Si pierdes el celular, entra con uno de estos códigos (cada uno sirve una vez). Guárdalos en tu gestor de contraseñas: no los volveremos a mostrar.",
    backupLabel: "Códigos de respaldo",
    copied: "Copiados ✓",
    copy: "Copiar los códigos",
    saved: "Ya guardé mis códigos de respaldo",
    goToAdmin: "Ir a Administración",
  },
  {
    en: {
      messages: { password: { required: "Enter your password." }, code: FIELD_TEXTS.en.totpCode },
      startError: "We couldn't start the setup. Try again.",
      step1: "Step 1 of 3: confirm it's you",
      step1Intro: "You need Google Authenticator (or any code app) installed on your phone.",
      password: "Your password",
      wait: "One moment…",
      next: "Continue",
      step2: "Step 2 of 3: scan the code",
      step2Intro: { tap: "In Google Authenticator tap", scan: "Scan a QR code", rest: "and point the camera here. Then enter the 6-digit code that shows up." },
      qr: "QR code to add Anotado to Google Authenticator",
      manual: "Can't scan it? Choose “Enter a setup key” and type:",
      manualLabel: "Setup key",
      code: "6-digit code",
      verifying: "Verifying…",
      activate: "Turn on verification",
      step3: "Step 3 of 3: save your backup codes",
      done: "✓ Two-step verification is on and we signed out your other open sessions.",
      backupIntro: "If you lose your phone, sign in with one of these codes (each one works once). Save them in your password manager: we won't show them again.",
      backupLabel: "Backup codes",
      copied: "Copied ✓",
      copy: "Copy the codes",
      saved: "I saved my backup codes",
      goToAdmin: "Go to Administration",
    },
  },
);

export function TwoFactorSetup({
  // Carga completa (no navegación del router de Next): la cookie de sesión acaba de cambiar y el
  // router todavía recuerda que /admin redirigía aquí.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a propósito, ver arriba
  onDone = () => window.location.assign("/admin"),
}: {
  onDone?: () => void;
}) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const [step, setStep] = useState<Step>({ name: "password" });
  // Cada paso es un formulario nuevo: al cambiar de paso no quedan mensajes del anterior.
  const { errors, reset, formProps } = useFieldErrors(t.messages);
  const passwordErrorId = useId();
  const codeErrorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    startTransition(async () => {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || !data || !("totpURI" in data) || !data.totpURI) {
        setError(error ? authErrorMessage(error, locale) : t.startError);
        return;
      }
      setStep({ name: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
      reset();
    });
  }

  function onCode(event: FormEvent<HTMLFormElement>, backupCodes: string[]) {
    event.preventDefault();
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    startTransition(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        setError(authErrorMessage(error, locale));
        return;
      }
      await finishTwoFactorSetupAction();
      setStep({ name: "codes", backupCodes });
      reset();
    });
  }

  const alert = error && (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  );

  if (step.name === "password") {
    return (
      // key: cada paso es un formulario nuevo (nada del anterior, como lo escrito, pasa al siguiente).
      <form key="password" method="post" onSubmit={onPassword} {...formProps} className="card space-y-4 p-4">
        <div className="space-y-1 text-sm">
          <h3 className="font-semibold">{t.step1}</h3>
          <p className="text-muted">{t.step1Intro}</p>
        </div>
        <div className="space-y-1.5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t.password}</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password) || undefined}
              aria-describedby={describedBy(errors.password && passwordErrorId)}
              className="input"
            />
          </label>
          <FieldError id={passwordErrorId} message={errors.password} />
        </div>
        {alert}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? t.wait : t.next}
        </button>
      </form>
    );
  }

  if (step.name === "scan") {
    const manualKey = manualKeyFromUri(step.totpURI);
    return (
      <form key="scan" method="post" onSubmit={(e) => onCode(e, step.backupCodes)} {...formProps} className="card space-y-4 p-4">
        <div className="space-y-1 text-sm">
          <h3 className="font-semibold">{t.step2}</h3>
          <p className="text-muted">
            {t.step2Intro.tap} <strong>+</strong> → <strong>{t.step2Intro.scan}</strong> {t.step2Intro.rest}
          </p>
        </div>
        <QrCode value={step.totpURI} label={t.qr} />
        {manualKey && (
          <div className="space-y-1 text-sm">
            <p className="text-muted">{t.manual}</p>
            <p className="break-all rounded-lg bg-background px-3 py-2 font-mono" aria-label={t.manualLabel}>
              {manualKey}
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t.code}</span>
            <input
              name="code"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="\s*(\d\s*){6}"
              maxLength={7}
              aria-invalid={Boolean(errors.code) || undefined}
              aria-describedby={describedBy(errors.code && codeErrorId)}
              className="input font-mono tracking-widest"
            />
          </label>
          <FieldError id={codeErrorId} message={errors.code} />
        </div>
        {alert}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? t.verifying : t.activate}
        </button>
      </form>
    );
  }

  return (
    <section className="card space-y-4 p-4">
      <div className="space-y-1 text-sm">
        <h3 className="font-semibold">{t.step3}</h3>
        <p>{t.done}</p>
        <p className="text-muted">{t.backupIntro}</p>
      </div>
      <ul aria-label={t.backupLabel} className="grid grid-cols-2 gap-2 font-mono text-sm">
        {step.backupCodes.map((code) => (
          <li key={code} className="rounded-lg bg-background px-3 py-1.5 text-center">
            {code}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-background"
        onClick={async () => {
          await navigator.clipboard.writeText(step.backupCodes.join("\n"));
          setCopied(true);
        }}
      >
        {copied ? t.copied : t.copy}
      </button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        {t.saved}
      </label>
      <button
        type="button"
        disabled={!saved}
        className="btn-primary"
        onClick={onDone}
      >
        {t.goToAdmin}
      </button>
    </section>
  );
}
