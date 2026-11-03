import { roundToCents } from "@/lib/money";

// El cálculo del 4x1000, sin la base: lo usan el servidor (src/modules/transactions/gmf.ts) y el formulario de
// egresos, que muestra cuánto sería mientras se escribe el monto.

/** El 4x1000 de un monto, a los centavos: 4 por cada 1.000. */
export const gmfAmount = (amount: number): number => roundToCents((amount * 4) / 1000);
