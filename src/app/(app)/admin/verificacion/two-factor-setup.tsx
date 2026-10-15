"use client";

import { useState, useTransition, type FormEvent } from "react";
import { QrCode } from "@/components/qr-code";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { manualKeyFromUri } from "@/modules/auth/two-factor-rules";
import { finishTwoFactorSetupAction } from "./actions";

type Step = { name: "password" } | { name: "scan"; totpURI: string; backupCodes: string[] } | { name: "codes"; backupCodes: string[] };

/**
 * Configurar la verificación en dos pasos, una sola vez: (1) confirmar la contraseña, (2) escanear el
 * QR con Google Authenticator y escribir el primer código, (3) guardar los códigos de respaldo.
 */
export function TwoFactorSetup({
  // Carga completa (no navegación del router de Next): la cookie de sesión acaba de cambiar y el
  // router todavía recuerda que /admin redirigía aquí.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a propósito, ver arriba
  onDone = () => window.location.assign("/admin"),
}: {
  onDone?: () => void;
}) {
  const [step, setStep] = useState<Step>({ name: "password" });
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
        setError(error ? authErrorMessage(error) : "No pudimos empezar la configuración. Intenta de nuevo.");
        return;
      }
      setStep({ name: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
    });
  }

  function onCode(event: FormEvent<HTMLFormElement>, backupCodes: string[]) {
    event.preventDefault();
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    startTransition(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      await finishTwoFactorSetupAction();
      setStep({ name: "codes", backupCodes });
    });
  }

  const alert = error && (
    <p role="alert" className="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">
      {error}
    </p>
  );

  if (step.name === "password") {
    return (
      // key: cada paso es un formulario nuevo (nada del anterior, como lo escrito, pasa al siguiente).
      <form key="password" method="post" onSubmit={onPassword} className="card space-y-4 p-4">
        <div className="space-y-1 text-sm">
          <h2 className="font-semibold">Paso 1 de 3: confirma que eres tú</h2>
          <p className="text-muted">
            Necesitas Google Authenticator (o cualquier app de códigos) instalada en tu celular.
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Tu contraseña</span>
          <input name="password" type="password" required autoComplete="current-password" className="input" />
        </label>
        {alert}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Un momento…" : "Continuar"}
        </button>
      </form>
    );
  }

  if (step.name === "scan") {
    const manualKey = manualKeyFromUri(step.totpURI);
    return (
      <form key="scan" method="post" onSubmit={(e) => onCode(e, step.backupCodes)} className="card space-y-4 p-4">
        <div className="space-y-1 text-sm">
          <h2 className="font-semibold">Paso 2 de 3: escanea el código</h2>
          <p className="text-muted">
            En Google Authenticator toca <strong>+</strong> → <strong>Escanear un código QR</strong> y apunta
            la cámara aquí. Luego escribe el código de 6 dígitos que aparece.
          </p>
        </div>
        <QrCode value={step.totpURI} label="Código QR para agregar Finanzas MVP a Google Authenticator" />
        {manualKey && (
          <div className="space-y-1 text-sm">
            <p className="text-muted">¿No puedes escanearlo? Elige “Ingresar una clave de configuración” y escribe:</p>
            <p className="break-all rounded-lg bg-background px-3 py-2 font-mono" aria-label="Clave de configuración">
              {manualKey}
            </p>
          </div>
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Código de 6 dígitos</span>
          <input
            name="code"
            required
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="\s*(\d\s*){6}"
            maxLength={7}
            className="input font-mono tracking-widest"
          />
        </label>
        {alert}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Verificando…" : "Activar la verificación"}
        </button>
      </form>
    );
  }

  return (
    <section className="card space-y-4 p-4">
      <div className="space-y-1 text-sm">
        <h2 className="font-semibold">Paso 3 de 3: guarda tus códigos de respaldo</h2>
        <p>
          ✓ La verificación en dos pasos quedó activa y cerramos tus otras sesiones abiertas.
        </p>
        <p className="text-muted">
          Si pierdes el celular, entra con uno de estos códigos (cada uno sirve una vez). Guárdalos en
          tu gestor de contraseñas: no los volveremos a mostrar.
        </p>
      </div>
      <ul aria-label="Códigos de respaldo" className="grid grid-cols-2 gap-2 font-mono text-sm">
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
        {copied ? "Copiados ✓" : "Copiar los códigos"}
      </button>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Ya guardé mis códigos de respaldo
      </label>
      <button
        type="button"
        disabled={!saved}
        className="btn-primary"
        onClick={onDone}
      >
        Ir a Administración
      </button>
    </section>
  );
}
