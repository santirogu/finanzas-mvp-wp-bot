/** El monto más alto que se acepta (web y bot): 100 mil millones. Por encima, casi seguro es un error. */
export const MAX_AMOUNT = 100_000_000_000;

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Un monto como se muestra en toda la app (web y bot): con dos decimales y sin espacio después del
 * símbolo, "$1.000.000,00", "$45.900,50" o "−$50.000,00". Los negativos llevan el signo menos
 * tipográfico (U+2212), el mismo que las listas les ponen a los egresos, no el guion de Intl.
 */
export function formatMoney(amount: number, currency = "COP"): string {
  let fmt = formatters.get(currency);
  // Stryker disable next-line ConditionalExpression: el caché solo evita crear el formateador cada vez; el resultado es el mismo
  if (!fmt) {
    fmt = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    // Stryker disable next-line CallExpression: ídem (sin guardarlo, se vuelve a crear igual)
    formatters.set(currency, fmt);
  }
  // Intl pone un espacio duro entre el símbolo y el número ("$ 1.000,00"); se quita.
  // Stryker disable next-line Regex: sin el "^" da lo mismo (Intl pone un solo guion, el del negativo, al comienzo)
  return fmt.format(amount).replace(/\s/g, "").replace(/^-/, "−");
}

/**
 * Convierte lo que escribe el usuario en pesos, con hasta dos decimales para los centavos.
 * El punto separa miles y la coma los centavos: "$500.000", "1.250.000", "45.900,50", "500000".
 * Sin coma, un punto final seguido de 1 o 2 dígitos también son centavos ("45900.5", del teclado en
 * inglés): un punto de miles siempre va seguido de 3 dígitos, así que no hay confusión.
 * Devuelve null si no hay un monto válido mayor que cero, si tiene más de dos decimales ("1,500"
 * sería ambiguo) o si es negativo (el tipo ingreso/egreso ya indica el signo: "-5.000", "−5.000" o
 * "–5.000" no deben guardarse como 5.000).
 */
export function parseAmountInput(raw: string): number | null {
  // Cualquier guion o raya (\p{Pd}: el guion, la raya "–" y "—", que el iPhone pone en vez de "--", el
  // de ancho completo "－"…) y el signo menos tipográfico (U+2212) que muestra la app, si se copia un
  // monto de ella. Con JavaScript, el campo ya los quita al escribir (formatAmountTyping); esto cubre el
  // formulario enviado sin él.
  if (/[\p{Pd}\u2212]/u.test(raw)) return null;
  // Solo cuentan los dígitos y los separadores: "$", espacios y letras se ignoran.
  const text = raw.replace(/[^\d.,]/g, "");
  // Stryker disable next-line Regex: sin el "^" del segundo patrón el resultado es el mismo (solo hay dígitos y puntos, y el grupo perezoso arranca en 0)
  const match = text.includes(",") ? /^([\d.]*),(\d{0,2})$/.exec(text) : /^([\d.]*?)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const [, whole, decimals = ""] = match;
  // En centavos (enteros) para no arrastrar errores de float; sin dígitos, Number("00") es 0.
  const cents = Number(whole.replace(/\./g, "") + decimals.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents / 100;
}

/** Redondea a centavos: lo que propone el bot o una resta pueden traer más decimales o restos de float. */
export function roundToCents(amount: number): number {
  // "|| 0": -0,001 daría -0, que Intl muestra como "-$0,00".
  return Math.round(amount * 100) / 100 || 0;
}

/** Suma montos en centavos enteros: sumar los decimales como float deja restos (0,1 + 0,2 ≠ 0,3). */
export function sumAmounts(amounts: readonly number[]): number {
  return amounts.reduce((sum, amount) => sum + Math.round(amount * 100), 0) / 100;
}

/** "1250000" → "1.250.000". Sin Intl: con números largos, Number() perdería dígitos. */
function groupThousands(digits: string): string {
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return groups.join(".");
}

/**
 * El campo del monto mientras se escribe: pone los puntos de miles y deja hasta dos centavos
 * después de la coma ("1250000,5" → "1.250.000,5"). Un punto al final también abre los centavos
 * (el teclado en inglés no tiene coma); los demás puntos son de miles y se recalculan, así que
 * borrar el último dígito de "4.590" da "459" y no "4,59".
 */
export function formatAmountTyping(raw: string): string {
  const text = raw.replace(/[^\d.,]/g, "");
  const comma = text.indexOf(",");
  // Stryker disable next-line ArithmeticOperator: cualquier índice desde el punto final da lo mismo (el punto se quita con los demás no dígitos)
  const decimalAt = comma >= 0 ? comma : text.endsWith(".") ? text.length - 1 : -1;
  const whole = (decimalAt >= 0 ? text.slice(0, decimalAt) : text).replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (decimalAt < 0) return groupThousands(whole);
  const decimals = text.slice(decimalAt + 1).replace(/\D/g, "").slice(0, 2);
  return `${groupThousands(whole || "0")},${decimals}`;
}

/** Un monto guardado como se escribe en el formulario, siempre con sus centavos: "45.900,00", "45.900,50". */
export function amountInputValue(amount: number): string {
  const cents = Math.round(amount * 100);
  const rest = cents % 100;
  return `${groupThousands(String((cents - rest) / 100))},${String(rest).padStart(2, "0")}`;
}

/**
 * Lo escrito en el campo de monto, completado con sus dos decimales al salir del campo:
 * "500.000" → "500.000,00", "45.900,5" → "45.900,50". Vacío sigue vacío (el campo avisa que falta).
 */
export function completeAmountDecimals(raw: string): string {
  const typed = formatAmountTyping(raw);
  if (!typed) return "";
  const [whole, decimals = ""] = typed.split(",");
  return `${whole},${decimals.padEnd(2, "0")}`;
}

/**
 * Qué parte de un total es un monto, en porcentaje entero para mostrar: "55", o "<1" si hay dinero
 * pero menos del 1 % ("0" se leería como si no hubiera nada).
 */
export function formatShare(part: number, total: number): string {
  if (part <= 0 || total <= 0) return "0";
  const pct = Math.round((part / total) * 100);
  return pct === 0 ? "<1" : String(pct);
}
