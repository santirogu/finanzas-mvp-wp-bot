const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Un monto como se muestra en toda la app (web y bot): con dos decimales y sin espacio después del
 * símbolo, "$1.000.000,00" o "-$50.000,00". Los pesos se guardan enteros, así que en COP los
 * decimales son siempre ",00".
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
  return fmt.format(amount).replace(/\s/g, "");
}

/**
 * Convierte lo que escribe el usuario en un entero de pesos.
 * Acepta formato colombiano: "$500.000", "500.000", "1.250.000", "500000".
 * Los decimales (",50") se descartan porque en COP no se usan centavos.
 * Devuelve null si no hay un monto válido mayor que cero, incluidos los negativos
 * (el tipo ingreso/egreso ya indica el signo: "-5.000" no debe guardarse como 5.000).
 */
export function parseAmountInput(raw: string): number | null {
  if (raw.includes("-")) return null;
  // Stryker disable next-line StringLiteral: cualquier reemplazo sin dígitos da lo mismo (abajo se quitan)
  const withoutDecimals = raw.trim().replace(/,\d{1,2}$/, "");
  const digits = withoutDecimals.replace(/[^\d]/g, "");
  // Sin dígitos, Number("") es 0: lo rechaza la condición de abajo.
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}
