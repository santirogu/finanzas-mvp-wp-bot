// Códigos TOTP (RFC 6238) para las pruebas: lo mismo que calcula Google Authenticator a partir de
// la clave del QR. Así las pruebas de la verificación en dos pasos usan códigos reales, sin
// depender de Better Auth para generarlos.
import { createHmac } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 (RFC 4648) → bytes. Ignora espacios, guiones y el relleno "=". */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = "";
  for (const char of clean) {
    const value = BASE32.indexOf(char);
    if (value === -1) throw new Error(`Carácter base32 inválido: ${char}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((b) => parseInt(b, 2)));
}

/** El código de 6 dígitos de ese momento (HMAC-SHA1, períodos de 30 s). */
export function totp(secretBase32: string, now = Date.now(), { digits = 6, period = 30 } = {}): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / period)));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}

/** La clave en base32 de un otpauth://totp/...?secret=... (lo que trae el QR). */
export function secretFromUri(totpURI: string): string {
  const secret = new URL(totpURI).searchParams.get("secret");
  if (!secret) throw new Error("El URI no trae la clave");
  return secret;
}
