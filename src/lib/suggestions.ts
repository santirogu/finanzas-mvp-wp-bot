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
  const query = searchKey(typed);
  if (!query) return [];
  const groups: SuggestionMatch<T>[][] = [[], []];
  for (const item of items) {
    if (searchKey(item.description) === query) continue;
    // Letra por letra, recordando de dónde salió cada una: así la coincidencia se marca en el texto
    // original, con sus tildes (aunque una venga como letra + acento, al pegarla de otro lado).
    let letters = "";
    const from: number[] = [];
    let index = 0;
    for (const char of item.description) {
      const letter = plain(char);
      for (let k = 0; k < letter.length; k++) from.push(index);
      letters += letter;
      index += char.length;
    }
    from.push(item.description.length);
    // La primera vez que aparece al comienzo de una palabra ("ar" en "Varios arriendos": la segunda).
    let at = letters.indexOf(query);
    while (at >= 0 && !startsWord(letters, at)) at = letters.indexOf(query, at + 1);
    if (at < 0) continue;
    groups[at === 0 ? 0 : 1].push({ item, start: from[at], end: from[at + query.length] });
  }
  return groups.flat().slice(0, limit);
}
