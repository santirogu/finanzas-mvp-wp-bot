import { searchKey } from "@/lib/suggestions";

// "Los egresos más grandes" de Reportes: los egresos más altos del período, sin contar los gastos fijos
// (si no, el arriendo llenaría la lista todos los meses y taparía lo que de verdad sorprende).

/** Cuántos se ven de entrada; los demás, hasta BIGGEST_MAX, con "Ver los N siguientes". */
export const BIGGEST_SHOWN = 10;
export const BIGGEST_MAX = 25;
/**
 * Cuántos egresos trae la base, de los más altos, antes de quitar los fijos: un gasto fijo puede estar
 * varias veces en cada mes del período y ocupar los primeros puestos.
 */
export const BIGGEST_CANDIDATES = 500;

/** Un egreso del período, como lo da la base: del más alto al más bajo. */
export type ExpenseRow = {
  id: string;
  description: string;
  amount: number;
  /** YYYY-MM-DD. */
  occurredOn: string;
  categoryName: string | null;
  categoryEmoji: string | null;
};

/**
 * Los egresos (`rows`, en el orden en que vienen) sin los que tienen la descripción de un gasto fijo
 * (`fixed`, sin importar mayúsculas, tildes ni espacios, como los detecta recurringExpenses).
 */
export function withoutFixed(rows: ExpenseRow[], fixed: { description: string }[]): ExpenseRow[] {
  const fixedKeys = new Set(fixed.map((item) => searchKey(item.description)));
  return rows.filter((row) => !fixedKeys.has(searchKey(row.description)));
}

/** Los egresos más altos (`rows`, ya en orden), sin los gastos fijos. */
export function biggestExpenses(rows: ExpenseRow[], fixed: { description: string }[]): ExpenseRow[] {
  return withoutFixed(rows, fixed).slice(0, BIGGEST_MAX);
}
