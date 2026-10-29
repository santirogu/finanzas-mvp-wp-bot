"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { suggestEmailCorrection } from "@/lib/email-typo";
import type { FieldMessages } from "@/lib/field-errors";
import { afterLoginPath } from "@/lib/roles";
import { MAX_NAME_LENGTH } from "@/modules/auth/account-name";
import { TwoFactorLogin } from "./two-factor-login";

const TEXTS = texts(
  {
    // Los errores de los campos (en vez del globo del navegador).
    messages: {
      name: { required: "Escribe tu nombre." },
      email: { required: "Escribe tu correo." },
      password: { required: "Escribe tu contraseña." },
    } as Record<string, FieldMessages>,
    login: { title: "Inicia sesión", subtitle: "Bienvenido de nuevo", submit: "Entrar", other: "¿No tienes cuenta? ", otherLink: "Regístrate" },
    register: {
      title: "Crea tu cuenta",
      subtitle: "Empieza a llevar tus cuentas en minutos",
      submit: "Crear cuenta",
      other: "¿Ya tienes cuenta? ",
      otherLink: "Inicia sesión",
    },
    name: "Nombre",
    email: "Correo",
    password: "Contraseña",
    didYouMean: "¿Quisiste decir",
    fix: "Sí, corregir",
    keepEmail: "Si tu correo está bien escrito, toca “Crear cuenta” de nuevo.",
    pending: "Un momento…",
    help: "¿Necesitas ayuda?",
  },
  {
    en: {
      messages: {
        name: { required: "Enter your name." },
        email: { required: "Enter your email." },
        password: { required: "Enter your password." },
      },
      login: { title: "Sign in", subtitle: "Welcome back", submit: "Sign in", other: "Don't have an account? ", otherLink: "Sign up" },
      register: {
        title: "Create your account",
        subtitle: "Start tracking your money in minutes",
        submit: "Create account",
        other: "Already have an account? ",
        otherLink: "Sign in",
      },
      name: "Name",
      email: "Email",
      password: "Password",
      didYouMean: "Did you mean",
      fix: "Yes, fix it",
      keepEmail: "If your email is spelled right, tap “Create account” again.",
      pending: "One moment…",
      help: "Need help?",
    },
  },
);

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isRegister = mode === "register";
  const locale = useLocale();
  const t = TEXTS[locale];
  const page = isRegister ? t.register : t.login;
  const [email, setEmail] = useState("");
  // Sugerencia de corrección del dominio (solo en registro): "gmal.com" → "gmail.com".
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [warnedFor, setWarnedFor] = useState<string | null>(null);
  const suggestionId = useId();
  const nameErrorId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const { errors, formProps } = useFieldErrors(t.messages);
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
        setError(authErrorMessage(error, locale));
        return;
      }
      if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
        setNeedsCode(true);
        return;
      }
      // Un admin sin la verificación en dos pasos (uno nuevo) va directo a configurarla.
      router.replace(afterLoginPath(data && "user" in data ? data.user : null));
      router.refresh();
    });
  }

  if (needsCode) return <TwoFactorLogin onCancel={() => setNeedsCode(false)} />;

  return (
    <div className="card w-full max-w-sm p-6 sm:p-8">
      <h1 className="text-xl font-semibold">{page.title}</h1>
      <p className="mt-1 text-sm text-muted">{page.subtitle}</p>

      {/* method="post": si se envía antes de que cargue el JavaScript (o si falla), el navegador
          lo manda por su cuenta; con GET la contraseña quedaría en la URL (historial, logs). */}
      <form method="post" onSubmit={onSubmit} {...formProps} className="mt-6 space-y-4">
        {isRegister && (
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t.name}</span>
              <input
                name="name"
                required
                maxLength={MAX_NAME_LENGTH}
                autoComplete="name"
                aria-invalid={Boolean(errors.name) || undefined}
                aria-describedby={describedBy(errors.name && nameErrorId)}
                className="input"
              />
            </label>
            <FieldError id={nameErrorId} message={errors.name} />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t.email}</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              value={email}
              aria-invalid={Boolean(errors.email) || undefined}
              aria-describedby={describedBy(errors.email && emailErrorId, suggestion && suggestionId)}
              onChange={(e) => {
                setEmail(e.target.value);
                setSuggestion(null);
              }}
              onBlur={() => checkEmail(email)}
            />
          </label>
          <FieldError id={emailErrorId} message={errors.email} />
          {/* Fuera del <label>: si no, el nombre del campo incluiría la sugerencia y su botón.
              aria-live: el lector de pantalla la anuncia al aparecer. */}
          <div aria-live="polite">
            {suggestion && (
              <p id={suggestionId} className="rounded-lg bg-brand/10 px-3 py-2 text-sm">
                {t.didYouMean} <strong className="break-all">{suggestion}</strong>?{" "}
                <button
                  type="button"
                  className="font-medium text-brand underline underline-offset-2"
                  onClick={() => {
                    setEmail(suggestion);
                    setSuggestion(null);
                  }}
                >
                  {t.fix}
                </button>
                {warnedFor === email && (
                  <span className="mt-1 block text-xs text-muted">{t.keepEmail}</span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t.password}</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete={isRegister ? "new-password" : "current-password"}
              aria-invalid={Boolean(errors.password) || undefined}
              aria-describedby={describedBy(errors.password && passwordErrorId)}
              className="input"
            />
          </label>
          <FieldError id={passwordErrorId} message={errors.password} />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? t.pending : page.submit}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {page.other}
        <Link href={isRegister ? "/login" : "/registro"} className="font-medium text-brand">
          {page.otherLink}
        </Link>
      </p>
      {/* La Ayuda sin sesión (también para quien olvidó la contraseña). Sin precargar: con sesión, /ayuda es otra
          página, y la precargada podría quedar en el navegador después de entrar (src/proxy.ts). */}
      <p className="mt-3 text-center text-sm">
        <Link href="/ayuda" prefetch={false} className="font-medium text-brand">
          {t.help}
        </Link>
      </p>
    </div>
  );
}
