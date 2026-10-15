// Códigos de Google Authenticator (TOTP, RFC 6238), como los calcula el plugin twoFactor de Better
// Auth: HMAC-SHA1 de la clave guardada, períodos de 30 s y 6 dígitos. Sin base de datos: la
// confirmación de las acciones del admin (límite de intentos, un solo uso) está en confirm-code.ts.

import { createHmac, timingSafeEqual } from "node:crypto";

export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;

/** Lo que se escribió, sin espacios ("123 456" → "123456"). */
export const cleanCode = (code: string) => code.replace(/\s/g, "");

/** ¿Tiene forma de código? Exactamente 6 dígitos. */
export const isCodeFormat = (code: string) => /^\d{6}$/.test(code);

/** El número de período de 30 s de un instante (el "contador" de TOTP). */
export const timeStep = (now: Date) => Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);

/** El código de un período (HOTP, RFC 4226), con la clave tal como la guarda Better Auth. */
export function hotp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  // La clave es el texto en UTF-8 (lo que muestra el QR en base32).
  const hmac = createHmac("sha1", Buffer.from(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(value).padStart(DIGITS, "0");
}

/**
 * El período cuyo código es `code`: el de ahora, el anterior o el siguiente (el reloj del celular
 * puede ir un poco adelantado o atrasado), o null si no es ninguno. Compara los tres siempre, en
 * tiempo constante, para no revelar con la demora cuál se parece.
 */
export function matchingStep(secret: string, code: string, now: Date): number | null {
  if (!isCodeFormat(code)) return null;
  const current = timeStep(now);
  let match: number | null = null;
  // Si dos períodos tuvieran el mismo código (no pasa en la práctica), queda el más nuevo: el más
  // estricto para no reutilizar códigos.
  for (const step of [current - 1, current, current + 1]) {
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code))) match = step;
  }
  return match;
}
