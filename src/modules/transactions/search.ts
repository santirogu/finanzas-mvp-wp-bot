import { searchKey, wordStartMatch } from "@/lib/suggestions";

// El buscador de la lista del mes en Ingresos y Egresos (src/components/searchable-transaction-list.tsx):
// filtra en el navegador los movimientos que ya se cargaron, por la descripción y la categoría.

/** Desde cuántos movimientos del mes aparece el buscador: con menos, se ven todos de un vistazo. */
export const SEARCH_FROM = 6;

/** Lo que dice la fila cuando el movimiento no tiene categoría (también se puede buscar). */
export const NO_CATEGORY = "Sin categoría";

type Searchable = { description: string; categoryName: string | null };
type Range = { start: number; end: number };

/** Un movimiento que coincide, con dónde coincide (para marcarlo): en la descripción, en la categoría o en las dos. */
export type SearchHit<T> = { item: T; description: Range | null; category: Range | null };

/**
 * Los movimientos que coinciden con lo escrito al comienzo de una palabra de la descripción o de la
 * categoría ("claro" trae "Claro Hogar"; "deu", los de Deudas), sin importar mayúsculas, tildes ni
 * espacios de más, en el mismo orden de la lista. Sin nada escrito, null: no hay búsqueda.
 */
export function searchTransactions<T extends Searchable>(typed: string, items: readonly T[]): SearchHit<T>[] | null {
  const query = searchKey(typed);
  if (!query) return null;
  const hits: SearchHit<T>[] = [];
  for (const item of items) {
    const description = wordStartMatch(item.description, query);
    const category = wordStartMatch(item.categoryName ?? NO_CATEGORY, query);
    if (description || category) hits.push({ item, description, category });
  }
  return hits;
}
