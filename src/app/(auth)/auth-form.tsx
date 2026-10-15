"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { suggestEmailCorrection } from "@/lib/email-typo";
import { TwoFactorLogin } from "./two-factor-login";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isRegister = mode === "register";
  const [email, setEmail] = useState("");
  // Sugerencia de corrección del dominio (solo en registro): "gmal.com" → "gmail.com".
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [warnedFor, setWarnedFor] = useState<string | null>(null);
  const suggestionId = useId();
  // Quien tiene la verificación en dos pasos pasa a un segundo paso después de la contraseña.
  const [needsCode, setNeedsCode] = useState(false);

  function checkEmail(value: string) {
    const next = isRegister ? suggestEmailCorrection(value) : null;
    setSuggestion(next);
    return next;
  }

  // onSubmit en vez de action: así React no vacía el formulario si hay un error.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "");

    // Primer intento con un dominio sospechoso: avisamos y no enviamos.
    // Si vuelve a enviar el mismo correo, asumimos que está bien escrito.
    if (isRegister && warnedFor !== email && checkEmail(email)) {
      setWarnedFor(email);
      return;
    }

    startTransition(async () => {
      const { data, error } = isRegister
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });

      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
        setNeedsCode(true);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  if (needsCode) return <TwoFactorLogin onCancel={() => setNeedsCode(false)} />;

  return (
    <div className="card w-full max-w-sm p-6 sm:p-8">
      <h1 className="text-xl font-semibold">{isRegister ? "Crea tu cuenta" : "Inicia sesión"}</h1>
      <p className="mt-1 text-sm text-muted">
        {isRegister ? "Empieza a llevar tus cuentas en minutos." : "Bienvenido de nuevo."}
      </p>

      {/* method="post": si se envía antes de que cargue el JavaScript (o si falla), el navegador
          lo manda por su cuenta; con GET la contraseña quedaría en la URL (historial, logs). */}
      <form method="post" onSubmit={onSubmit} className="mt-6 space-y-4">
        {isRegister && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Nombre</span>
            <input name="name" required autoComplete="name" className="input" />
          </label>
        )}
        <div className="space-y-1.5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Correo</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              value={email}
              aria-describedby={suggestion ? suggestionId : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                setSuggestion(null);
              }}
              onBlur={() => checkEmail(email)}
            />
          </label>
          {/* Fuera del <label>: si no, el nombre del campo incluiría la sugerencia y su botón.
              aria-live: el lector de pantalla la anuncia al aparecer. */}
          <div aria-live="polite">
            {suggestion && (
              <p id={suggestionId} className="rounded-lg bg-brand/10 px-3 py-2 text-sm">
                ¿Quisiste decir <strong className="break-all">{suggestion}</strong>?{" "}
                <button
                  type="button"
                  className="font-medium text-brand underline underline-offset-2"
                  onClick={() => {
                    setEmail(suggestion);
                    setSuggestion(null);
                  }}
                >
                  Sí, corregir
                </button>
                {warnedFor === email && (
                  <span className="mt-1 block text-xs text-muted">
                    Si tu correo está bien escrito, presiona “Crear cuenta” de nuevo.
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Contraseña</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="input"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Un momento…" : isRegister ? "Crear cuenta" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {isRegister ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
        <Link href={isRegister ? "/login" : "/registro"} className="font-medium text-brand">
          {isRegister ? "Inicia sesión" : "Regístrate"}
        </Link>
      </p>
    </div>
  );
}
