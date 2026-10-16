/**
 * El texto sin caracteres de control (los de código menor a 32 y el 127): no se ven, no sirven para
 * buscar y Postgres rechaza el nulo en un texto (el pedido fallaría y el error iría a los logs con
 * los datos).
 */
export const withoutControlChars = (text: string) =>
  Array.from(text)
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join("");
