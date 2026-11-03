import { roundToCents } from "@/lib/money";

// El cálculo del 4x1000 y cómo se anota, sin la base: lo usan el servidor (src/modules/transactions/gmf.ts) y el
// formulario de egresos, que muestra cuánto sería mientras se escribe el monto.

/** El largo máximo de una descripción (src/modules/transactions/validation.ts). */
const MAX_DESCRIPTION = 140;

/** El 4x1000 de un monto, a los centavos: 4 por cada 1.000. */
export const gmfAmount = (amount: number): number => roundToCents((amount * 4) / 1000);

/** La descripción del 4x1000 de un egreso: "4x1000 · Arriendo". */
export const gmfDescription = (description: string): string => `4x1000 · ${description}`.slice(0, MAX_DESCRIPTION);

/**
 * El id externo del 4x1000 de un egreso del bot: el mismo mensaje ("wamid…:0" → "wamid…:4x0"), así "deshacer" se
 * lleva el egreso y su 4x1000 juntos (src/modules/transactions/bot-mutations.ts).
 */
export function gmfExternalId(externalId: string | null): string | null {
  if (!externalId) return null;
  const cut = externalId.lastIndexOf(":");
  return `${externalId.slice(0, cut)}:4x${externalId.slice(cut + 1)}`;
}
