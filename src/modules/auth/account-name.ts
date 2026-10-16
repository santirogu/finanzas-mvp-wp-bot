// El nombre de una cuenta: lo muestra el panel de administración (listados de hasta 500 filas) y lo
// usa el bot al saludar. Better Auth no lo valida (acepta cualquier texto, de cualquier largo), así
// que lo revisa el hook del registro en src/lib/auth.ts. Sin dependencias: se prueba aparte.

export const MAX_NAME_LENGTH = 80;

// Caracteres de control (salvo tabulación y saltos de línea, que se vuelven espacios) y los
// invisibles que cambian cómo se ve el texto: espacio de ancho cero, marcas y controles de dirección
// (con ellos "Ana" puede verse como otro nombre) y el BOM. Se permiten el ZWJ y el ZWNJ, que forman
// emojis y se usan en algunos idiomas.
const HIDDEN_CHARACTERS = /(?![\t\n\r])[\p{Cc}\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;

export type AccountNameResult = { ok: true; value: string } | { ok: false; error: string };

/** El nombre limpio (sin espacios de más) o por qué no se acepta. */
export function parseAccountName(raw: unknown): AccountNameResult {
  if (typeof raw !== "string") return { ok: false, error: "Escribe tu nombre." };
  if (HIDDEN_CHARACTERS.test(raw)) {
    return { ok: false, error: "El nombre tiene caracteres que no se permiten." };
  }
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, error: "Escribe tu nombre." };
  // Por caracteres y no por unidades de UTF-16: un emoji cuenta como uno.
  if ([...value].length > MAX_NAME_LENGTH) {
    return { ok: false, error: `El nombre puede tener máximo ${MAX_NAME_LENGTH} caracteres.` };
  }
  return { ok: true, value };
}
