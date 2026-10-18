/**
 * El texto sin caracteres de control (los de código menor a 32 y el 127): no se ven, no sirven para
 * buscar y Postgres rechaza el nulo en un texto (el pedido fallaría y el error iría a los logs con
 * los datos).
 */
export const withoutControlChars = (text: string) =>
  Array.from(text)
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join("");

/**
 * Las iniciales del círculo de la cuenta (el menú del encabezado): la primera letra de las dos
 * primeras palabras del nombre, en mayúscula ("Santiago Rodriguez Gutierrez" → "SR", "ángela" → "Á").
 * Sin nombre, la primera letra del correo.
 */
export function initialsOf(name: string, email: string): string {
  const words = name.match(/\S+/g) ?? [];
  const letters = words.length > 0 ? words.slice(0, 2).map((word) => Array.from(word)[0]) : [Array.from(email.trim())[0] ?? "?"];
  return letters.join("").toLocaleUpperCase("es");
}
