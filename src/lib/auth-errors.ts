// Mensajes en español para los errores de Better Auth que se muestran al entrar o registrarse.

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con ese correo.",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 8 caracteres.",
  INVALID_EMAIL: "El correo no es válido.",
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
  if (error.status === 429) return TOO_MANY_ATTEMPTS;
  return (error.code && MESSAGES[error.code]) || error.message || "Algo salió mal.";
}
