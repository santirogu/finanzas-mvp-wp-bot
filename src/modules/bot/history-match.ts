// Usar en el bot la descripción que la persona ya tiene en su historial (src/modules/bot/history.ts): si
// escribe "pago claro amor" y ya registró "Claro Postpago Cata Amor", se guarda esa, así sus gastos de
// siempre quedan con el mismo nombre. Se compara palabra por palabra, sin tildes ni mayúsculas, en el
// servidor: no cuesta nada ni le manda el historial a Claude. Sin sinónimos, a propósito.

import { searchKey } from "@/lib/suggestions";

/** Una descripción del historial, con la categoría de la última vez y cuántas veces se usó. */
export type HistoryEntry = { description: string; categoryId: string | null; uses: number };

/** Palabras que no cuentan al comparar: "pago de claro" busca lo mismo que "pago claro". */
const IGNORED = new Set(["a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "mi", "mis", "para", "por", "su", "sus", "un", "una", "y"]);

/** Las palabras que cuentan de un texto, sin tildes ni mayúsculas ("Pago de Clarö" → ["pago", "claro"]). */
export function meaningfulWords(text: string): string[] {
  return searchKey(text)
    // Stryker disable next-line Regex: sin el "+" quedan palabras vacías entre dos signos, que el filtro de abajo quita
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "" && !IGNORED.has(word));
}

/** Las mismas palabras, sin importar el orden: "claro pago" es "pago claro". */
const sameWords = (a: readonly string[], b: readonly string[]) => [...a].sort().join(" ") === [...b].sort().join(" ");

/**
 * ¿Está esa palabra entre las del historial? Igual, al comienzo de una ("net" en "netflix") o, con cuatro
 * letras o más, dentro de una ("pago" en "postpago"). Con menos, adentro no: "luz" no es "aluzinado".
 */
function wordFound(word: string, theirs: readonly string[]): boolean {
  return theirs.some((their) => their === word || (word.length >= 3 && their.startsWith(word)) || (word.length >= 4 && their.includes(word)));
}

/**
 * La descripción del historial que corresponde a lo que escribió, o null:
 * - con una sola palabra, solo la que tiene esa misma ("almuerzo" → "Almuerzo", nunca "Almuerzo con Ana");
 * - con dos o más, una que las tenga todas ("pago claro amor" → "Claro Postpago Cata Amor").
 * Entre varias, la que tiene exactamente sus palabras y, si no, la más usada. Si empatan dos, ninguna: mejor
 * dejar la de Claude que adivinar.
 */
export function matchHistory(description: string, history: readonly HistoryEntry[]): HistoryEntry | null {
  const words = meaningfulWords(description);
  if (words.length === 0) return null;
  const candidates = history
    .map((entry) => ({ entry, theirs: meaningfulWords(entry.description) }))
    .filter(({ theirs }) => (words.length === 1 ? sameWords(words, theirs) : words.every((word) => wordFound(word, theirs))));
  const exact = candidates.filter(({ theirs }) => sameWords(words, theirs));
  const ranked = (exact.length > 0 ? exact : candidates).map(({ entry }) => entry).sort((a, b) => b.uses - a.uses);
  if (ranked.length === 0 || (ranked.length > 1 && ranked[1].uses === ranked[0].uses)) return null;
  return ranked[0];
}
