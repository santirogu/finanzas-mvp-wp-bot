import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica la cabecera X-Hub-Signature-256 que Meta envía con cada webhook:
 * "sha256=" + HMAC-SHA256(cuerpo crudo, App Secret). Sin esto, cualquiera
 * podría enviar mensajes falsos a nombre de un usuario.
 */
export function isValidSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  // Un hex inválido produce un buffer más corto, que falla la comparación de longitud.
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function signBody(rawBody: string, appSecret: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}
