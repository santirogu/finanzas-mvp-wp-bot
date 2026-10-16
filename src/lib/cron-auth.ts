import { timingSafeEqual } from "node:crypto";

/**
 * ¿El pedido viene de Vercel Cron? Vercel manda `Authorization: Bearer <CRON_SECRET>` cuando la
 * variable está configurada. Sin secreto configurado, nunca: la ruta no queda abierta por olvido.
 * La comparación es en tiempo constante (no revela cuántos caracteres coinciden).
 */
export function isCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
