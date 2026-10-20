// Buscar entre las descripciones que ya usó la persona mientras escribe una nueva (el formulario de
// movimientos): sin importar mayúsculas, tildes ni espacios de más, y con la parte que coincide marcada.

/** Cuántas sugerencias se muestran a la vez. */
export const MAX_SHOWN_SUGGESTIONS = 6;

/** Una letra para comparar: sin tilde y en minúscula ("É" → "e"). */
const plain = (char: string) => char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Un texto para comparar: sin tildes, en minúscula y con los espacios de más quitados ("  Café  con leche " → "cafe con leche"). */
export function searchKey(text: string): string {
  return plain(text).trim().replace(/\s+/g, " ");
}

/** Una sugerencia que coincide, con dónde está la coincidencia en su texto (para marcarla). */
export type SuggestionMatch<T> = { item: T; start: number; end: number };

/** Un comienzo de palabra: lo que va después de algo que no es letra ni número (espacio, guion, paréntesis). */
const startsWord = (letters: string, at: number) => at === 0 || /[^\p{L}\p{N}]/u.test(letters[at - 1]);

/**
 * Dónde está lo buscado (ya pasado por `searchKey`) en un texto, la primera vez que aparece al
 * comienzo de una palabra ("ar" en "Varios arriendos": la segunda), en posiciones del texto original
 * (para marcarlo con sus tildes). null si no está, o si solo está a mitad de palabra ("ari" en
 * "hipotecario").
 */
export function wordStartMatch(text: string, query: string): { start: number; end: number } | null {
  if (!query) return null;
  // Letra por letra, recordando de dónde salió cada una: así la coincidencia se marca en el texto
  // original, con sus tildes (aunque una venga como letra + acento, al pegarla de otro lado).
  let letters = "";
  const from: number[] = [];
  let index = 0;
  for (const char of text) {
    const letter = plain(char);
    for (let k = 0; k < letter.length; k++) from.push(index);
    letters += letter;
    index += char.length;
  }
  from.push(text.length);
  let at = letters.indexOf(query);
  // Stryker disable next-line EqualityOperator: en la posición 0 siempre empieza una palabra, así que el bucle termina igual
  while (at >= 0 && !startsWord(letters, at)) at = letters.indexOf(query, at + 1);
  return at < 0 ? null : { start: from[at], end: from[at + query.length] };
}

/**
 * Las sugerencias que coinciden con lo escrito al comienzo de una palabra: primero las que empiezan
 * igual, después las que tienen otra palabra que empieza igual; en cada grupo, en el orden en que
 * llegaron (las más usadas primero). A mitad de palabra no cuenta ("ari" no trae "hipotecario"). La
 * que es igual a lo escrito no se sugiere (ya está).
 */
export function matchSuggestions<T extends { description: string }>(
  typed: string,
  items: readonly T[],
  limit = MAX_SHOWN_SUGGESTIONS,
): SuggestionMatch<T>[] {
  // Sin nada escrito, wordStartMatch no encuentra nada: ninguna sugerencia.
  const query = searchKey(typed);
  const groups: SuggestionMatch<T>[][] = [[], []];
  for (const item of items) {
    if (searchKey(item.description) === query) continue;
    const match = wordStartMatch(item.description, query);
    if (!match) continue;
    groups[match.start === 0 ? 0 : 1].push({ item, ...match });
  }
  return groups.flat().slice(0, limit);
}
