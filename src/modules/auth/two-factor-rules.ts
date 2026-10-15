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

/** Endpoints donde se escribe un código: aceptan "recordar este dispositivo", que no se ofrece. */
const CODE_PATHS = ["/two-factor/verify-totp", "/two-factor/verify-backup-code"];

export const TWO_FACTOR_ERRORS = {
  ADMIN_ONLY: {
    code: "ADMIN_ONLY",
    message: "La verificación en dos pasos es solo para administradores.",
  },
  TRUST_DEVICE_NOT_ALLOWED: {
    code: "TRUST_DEVICE_NOT_ALLOWED",
    message: "Aquí no se puede recordar el dispositivo: el código se pide en cada inicio de sesión.",
  },
} as const;

export type TwoFactorViolation = keyof typeof TWO_FACTOR_ERRORS;

/**
 * Lo que no se permite en un pedido a Better Auth, o null. `isAdmin` es null si el pedido no trae
 * sesión (el endpoint responde 401 por su cuenta).
 */
export function twoFactorViolation({
  path,
  body,
  isAdmin,
}: {
  path: string;
  body: unknown;
  isAdmin: boolean | null;
}): TwoFactorViolation | null {
  if (path === "/two-factor/enable" && isAdmin === false) return "ADMIN_ONLY";
  if (CODE_PATHS.includes(path) && (body as { trustDevice?: unknown } | null)?.trustDevice) {
    return "TRUST_DEVICE_NOT_ALLOWED";
  }
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
