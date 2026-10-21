import { sumAmounts } from "@/lib/money";

// Las tajadas de la dona de "Egresos por categoría" (el Resumen). Los colores van por puesto (la más
// grande, el primero de la paleta), no por categoría: así nunca se repiten en una misma dona, aunque
// una categoría cambie de color de un mes a otro.

/** Cuántas categorías van con su propio color (los colores de la paleta, --chart-1 a --chart-7). */
export const MAX_SLICES = 7;
/** Las de menos de esta parte del total van juntas en una tajada gris ("3 más"): solas casi no se ven. */
export const SMALL_SHARE = 0.03;

export type CategoryTotal = { name: string; emoji: string; total: number };

export type ChartSlice =
  /** `color`: su puesto en la paleta (0 = --chart-1). */
  | { kind: "category"; color: number; category: CategoryTotal; share: number }
  /** Las chicas, juntas (en gris). */
  | { kind: "rest"; categories: CategoryTotal[]; total: number; share: number };

/**
 * Las tajadas, de la más grande a la más chica: hasta MAX_SLICES categorías con su color y, al final,
 * las de menos de SMALL_SHARE (o las que no alcanzaron color) juntas. Si solo quedaría una junta, va
 * sola con su color: no tiene sentido una tajada "1 más".
 */
export function chartSlices(categories: CategoryTotal[], total: number): ChartSlice[] {
  if (total <= 0) return [];
  const sorted = [...categories].sort((a, b) => b.total - a.total);
  let own = 0;
  while (own < sorted.length && own < MAX_SLICES && sorted[own].total / total >= SMALL_SHARE) own++;
  if (sorted.length - own === 1 && own < MAX_SLICES) own++;

  const slices: ChartSlice[] = sorted
    .slice(0, own)
    .map((category, color) => ({ kind: "category", color, category, share: category.total / total }));
  const rest = sorted.slice(own);
  if (rest.length > 0) {
    const restTotal = sumAmounts(rest.map((c) => c.total));
    slices.push({ kind: "rest", categories: rest, total: restTotal, share: restTotal / total });
  }
  return slices;
}

/** Dónde empieza cada tajada en la vuelta de la dona (0 a 1) y cuánto ocupa. */
export function donutArcs(slices: ChartSlice[]): { start: number; size: number }[] {
  let start = 0;
  return slices.map((slice) => {
    const arc = { start, size: slice.share };
    start += slice.share;
    return arc;
  });
}
