// Mensajes en español para los errores de Better Auth que se muestran al entrar, registrarse o
// configurar la verificación en dos pasos.

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con ese correo.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres.",
  INVALID_EMAIL: "El correo no es válido.",
  INVALID_PASSWORD: "Contraseña incorrecta.",
  // Verificación en dos pasos (plugin twoFactor y src/modules/auth/two-factor-rules.ts).
  INVALID_CODE: "Código incorrecto. Escribe el código que muestra Google Authenticator ahora.",
  INVALID_BACKUP_CODE: "Ese código de respaldo no es válido o ya se usó.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "Demasiados códigos incorrectos. Por seguridad, la verificación quedó bloqueada 15 minutos.",
  INVALID_TWO_FACTOR_COOKIE: "Pasaron más de 10 minutos. Vuelve a escribir tu correo y contraseña.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
    "Demasiados intentos en este inicio de sesión. Vuelve a escribir tu correo y contraseña.",
  TOTP_ALREADY_ENABLED: "La verificación en dos pasos ya está activa.",
  ADMIN_ONLY: "La verificación en dos pasos es solo para administradores.",
};

// Better Auth limita los intentos de login y registro por IP y responde 429 sin código de error
// (su mensaje viene en inglés).
export const TOO_MANY_ATTEMPTS = "Demasiados intentos. Espera unos segundos y vuelve a intentarlo.";

// Bloqueo por cuenta (src/lib/auth.ts): el servidor ya manda el mensaje en español, con los
// minutos que faltan.
export const ACCOUNT_LOCKED =
  "Por seguridad, la cuenta quedó bloqueada por varios intentos fallidos. Intenta más tarde.";

export function authErrorMessage(error: { code?: string; status?: number; message?: string }) {
  if (error.code === "ACCOUNT_LOCKED") return error.message || ACCOUNT_LOCKED;
  // El bloqueo de la verificación en dos pasos también llega con 429, pero tiene su propio mensaje.
  if (error.code === "ACCOUNT_TEMPORARILY_LOCKED") return MESSAGES.ACCOUNT_TEMPORARILY_LOCKED;
  if (error.status === 429) return TOO_MANY_ATTEMPTS;
  return (error.code && MESSAGES[error.code]) || error.message || "Algo salió mal.";
}
