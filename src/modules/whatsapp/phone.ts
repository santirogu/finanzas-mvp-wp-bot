/** "573001234567" → "+57 300 ••• 4567" (para mostrar sin exponer el número completo). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length === 12) {
    return `+57 ${digits.slice(2, 5)} ••• ${digits.slice(-4)}`;
  }
  return `+${digits.slice(0, -4).replace(/\d/g, "•")}${digits.slice(-4)}`;
}

/**
 * "573001112233" → "+57 300 111 2233": un número completo, en el mismo formato en toda la app (el
 * del bot al vincular; los de las cuentas, solo en la administración).
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length === 12) {
    return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}
