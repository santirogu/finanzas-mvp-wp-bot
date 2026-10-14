const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency = "COP"): string {
  let fmt = formatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "COP" ? 0 : 2,
    });
    formatters.set(currency, fmt);
  }
  return fmt.format(amount);
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
  const withoutDecimals = raw.trim().replace(/,\d{1,2}$/, "");
  const digits = withoutDecimals.replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}
