// Reglas propias sobre el plugin de verificación en dos pasos (twoFactor) de Better Auth. Sin
// dependencias: las usa src/lib/auth.ts en sus hooks y se prueban por separado.
//
// La verificación es solo para administradores y obligatoria para entrar a la sección de
// administración. Se configura una sola vez con Google Authenticator (o cualquier app TOTP) y no se
// desactiva desde la app: si se pierde el celular, se usa un código de respaldo o el dueño la
// reinicia desde la terminal (pnpm admin:reset-2fa).

/** Nombre de la app en Google Authenticator. */
export const TWO_FACTOR_ISSUER = "Finanzas MVP";

/** Códigos incorrectos seguidos antes de bloquear la verificación, y por cuánto tiempo. */
export const TWO_FACTOR_LOCKOUT = { maxFailedAttempts: 5, durationSeconds: 15 * 60 } as const;

/**
 * Endpoints del plugin que se apagan (responden 404). Con la sesión robada y la contraseña,
 * permitirían desactivar la verificación, llevarse la clave secreta o generar códigos de respaldo
 * nuevos: justo lo que la verificación debe impedir. OTP (códigos por correo o SMS) no se usa.
 */
export const TWO_FACTOR_DISABLED_PATHS = [
  "/two-factor/disable",
  "/two-factor/get-totp-uri",
  "/two-factor/generate-backup-codes",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
] as const;

/**
 * Endpoints donde se escribe un código. Aceptan "recordar este dispositivo", que no se ofrece, y
 * con una sesión abierta responden si el código es correcto sin contar los fallos: por eso, con la
 * verificación ya activa, solo se usan para entrar (sin sesión todavía).
 */
export const TWO_FACTOR_CODE_PATHS = ["/two-factor/verify-totp", "/two-factor/verify-backup-code"] as const;

export const TWO_FACTOR_ERRORS = {
  ADMIN_ONLY: {
    code: "ADMIN_ONLY",
    message: "La verificación en dos pasos es solo para administradores.",
  },
  TRUST_DEVICE_NOT_ALLOWED: {
    code: "TRUST_DEVICE_NOT_ALLOWED",
    message: "Aquí no se puede recordar el dispositivo: el código se pide en cada inicio de sesión.",
  },
  // Con la sesión de un admin (sin su celular) se podrían probar códigos sin límite y usar el que
  // acierte para confirmar una acción de administración (auditoría de seguridad 2026-10-15).
  ALREADY_VERIFIED: {
    code: "TWO_FACTOR_ALREADY_VERIFIED",
    message: "La verificación en dos pasos ya está activa: el código se pide al entrar y al confirmar cada acción.",
  },
} as const;

export type TwoFactorViolation = keyof typeof TWO_FACTOR_ERRORS;

/** Las rutas de dos pasos en las que el hook necesita la sesión para decidir. */
export const needsSession = (path: string) =>
  path === "/two-factor/enable" || (TWO_FACTOR_CODE_PATHS as readonly string[]).includes(path);

/**
 * Lo que no se permite en un pedido a Better Auth, o null. `session` es null si el pedido no trae
 * sesión: al entrar con el código, o sin sesión (el endpoint responde 401 por su cuenta).
 */
export function twoFactorViolation({
  path,
  body,
  session,
}: {
  path: string;
  body: unknown;
  session: { isAdmin: boolean; twoFactorEnabled: boolean } | null;
}): TwoFactorViolation | null {
  if (path === "/two-factor/enable" && session?.isAdmin === false) return "ADMIN_ONLY";
  if (!(TWO_FACTOR_CODE_PATHS as readonly string[]).includes(path)) return null;
  if ((body as { trustDevice?: unknown } | null)?.trustDevice) return "TRUST_DEVICE_NOT_ALLOWED";
  if (session?.twoFactorEnabled) return "ALREADY_VERIFIED";
  return null;
}

/** La clave para escribir a mano en la app (si no se puede escanear el QR), en grupos de 4. */
export function manualKeyFromUri(totpURI: string): string | null {
  try {
    const secret = new URL(totpURI).searchParams.get("secret");
    return secret ? secret.match(/.{1,4}/g)!.join(" ") : null;
  } catch {
    return null;
  }
}
