// Los mensajes de los errores de Better Auth que se muestran al entrar, registrarse o configurar la
// verificación en dos pasos, en el idioma de la página.

import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { CONTACT_EMAIL } from "./contact";

export const AUTH_ERROR_TEXTS = texts(
  {
    codes: {
      INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
      USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo.",
      USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con ese correo.",
      PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres.",
      PASSWORD_TOO_LONG: "La contraseña puede tener máximo 128 caracteres.",
      INVALID_EMAIL: "El correo no es válido.",
      INVALID_PASSWORD: "Contraseña incorrecta.",
      // Verificación en dos pasos (plugin twoFactor y src/modules/auth/two-factor-rules.ts).
      INVALID_CODE: "Código incorrecto. Escribe el código que muestra Google Authenticator ahora.",
      INVALID_BACKUP_CODE: "Ese código de respaldo no es válido o ya se usó.",
      ACCOUNT_TEMPORARILY_LOCKED: "Demasiados códigos incorrectos. Por seguridad, la verificación quedó bloqueada 15 minutos.",
      INVALID_TWO_FACTOR_COOKIE: "Pasaron más de 10 minutos. Vuelve a escribir tu correo y contraseña.",
      TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Demasiados intentos en este inicio de sesión. Vuelve a escribir tu correo y contraseña.",
      TOTP_ALREADY_ENABLED: "La verificación en dos pasos ya está activa.",
      ADMIN_ONLY: "La verificación en dos pasos es solo para administradores.",
      TWO_FACTOR_ALREADY_VERIFIED: "La verificación en dos pasos ya está activa.",
    } as Record<string, string>,
    // Better Auth limita los intentos de login y registro por IP y responde 429 sin código de error (su
    // mensaje viene en inglés).
    tooManyAttempts: "Demasiados intentos. Espera unos segundos y vuelve a intentarlo.",
    // Bloqueo por cuenta (src/lib/auth.ts): el servidor manda el mensaje en español, con los minutos que
    // faltan; este es el de respaldo (y el del inglés, sin los minutos).
    accountLocked: "Por seguridad, la cuenta quedó bloqueada por varios intentos fallidos. Intenta más tarde.",
    // Cuenta suspendida por el admin (src/modules/account/suspension.ts): sin el motivo.
    accountSuspended: `Tu cuenta está suspendida. Si crees que es un error, escríbenos a ${CONTACT_EMAIL}.`,
    // El nombre que rechaza el registro (src/modules/auth/account-name.ts): el servidor lo explica en
    // español; este es el del inglés.
    invalidName: null as string | null,
    fallback: "Algo salió mal.",
  },
  {
    en: {
      codes: {
        INVALID_EMAIL_OR_PASSWORD: "Wrong email or password.",
        USER_ALREADY_EXISTS: "There's already an account with that email.",
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "There's already an account with that email.",
        PASSWORD_TOO_SHORT: "The password must have at least 8 characters.",
        PASSWORD_TOO_LONG: "The password can have at most 128 characters.",
        INVALID_EMAIL: "The email isn't valid.",
        INVALID_PASSWORD: "Wrong password.",
        INVALID_CODE: "Wrong code. Enter the code Google Authenticator shows right now.",
        INVALID_BACKUP_CODE: "That backup code isn't valid or was already used.",
        ACCOUNT_TEMPORARILY_LOCKED: "Too many wrong codes. For security, verification is locked for 15 minutes.",
        INVALID_TWO_FACTOR_COOKIE: "More than 10 minutes went by. Enter your email and password again.",
        TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many attempts in this sign-in. Enter your email and password again.",
        TOTP_ALREADY_ENABLED: "Two-step verification is already on.",
        ADMIN_ONLY: "Two-step verification is only for administrators.",
        TWO_FACTOR_ALREADY_VERIFIED: "Two-step verification is already on.",
      },
      tooManyAttempts: "Too many attempts. Wait a few seconds and try again.",
      accountLocked: "For security, the account was locked after several failed attempts. Try again later.",
      accountSuspended: `Your account is suspended. If you think this is a mistake, write to us at ${CONTACT_EMAIL}.`,
      invalidName: "Check your name: it has characters that aren't allowed, or it's too long.",
      fallback: "Something went wrong.",
    },
  },
);

// En español: los usan las pruebas y los mensajes de respaldo.
export const TOO_MANY_ATTEMPTS = AUTH_ERROR_TEXTS.es.tooManyAttempts;
export const ACCOUNT_LOCKED = AUTH_ERROR_TEXTS.es.accountLocked;
export const ACCOUNT_SUSPENDED = AUTH_ERROR_TEXTS.es.accountSuspended;

export function authErrorMessage(error: { code?: string; status?: number; message?: string }, locale: Locale = DEFAULT_LOCALE) {
  const t = AUTH_ERROR_TEXTS[locale];
  // Los mensajes que arma el servidor vienen en español: en otro idioma, el propio.
  const fromServer = locale === "es" ? error.message : undefined;
  if (error.code === "ACCOUNT_LOCKED") return fromServer || t.accountLocked;
  if (error.code === "ACCOUNT_SUSPENDED") return t.accountSuspended;
  if (error.code === "INVALID_NAME" && t.invalidName) return t.invalidName;
  // El bloqueo de la verificación en dos pasos también llega con 429, pero tiene su propio mensaje.
  if (error.code === "ACCOUNT_TEMPORARILY_LOCKED") return t.codes.ACCOUNT_TEMPORARILY_LOCKED;
  if (error.status === 429) return t.tooManyAttempts;
  return (error.code && t.codes[error.code]) || error.message || t.fallback;
}
