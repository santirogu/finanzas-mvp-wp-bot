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

/**
 * Las sugerencias que coinciden con lo escrito: primero las que empiezan igual, después las que tienen
 * una palabra que empieza igual y al final las que lo tienen en el medio; en cada grupo, en el orden
 * en que llegaron (las más usadas primero). La que es igual a lo escrito no se sugiere (ya está).
 */
export function matchSuggestions<T extends { description: string }>(
  typed: string,
  items: readonly T[],
  limit = MAX_SHOWN_SUGGESTIONS,
): SuggestionMatch<T>[] {
  const query = searchKey(typed);
  if (!query) return [];
  const groups: SuggestionMatch<T>[][] = [[], [], []];
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
    const at = letters.indexOf(query);
    if (at < 0) continue;
    const group = at === 0 ? 0 : /\s/.test(letters[at - 1]) ? 1 : 2;
    groups[group].push({ item, start: from[at], end: from[at + query.length] });
  }
  return groups.flat().slice(0, limit);
}
