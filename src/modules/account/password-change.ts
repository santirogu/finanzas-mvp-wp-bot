// Las reglas del formulario "Cambiar contraseña" de Mi cuenta (src/modules/account/actions.ts), sin
// dependencias: las usan el servidor y las pruebas. Las mismas del registro (src/lib/auth.ts).

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordChangeField = "current" | "next" | "repeat" | "code";
export type PasswordChangeInput = { current: string; next: string; repeat: string };

/**
 * Los errores de cada campo (vacío si está todo bien): la actual, la nueva (largo y distinta de la
 * actual) y la repetición. La actual se revisa después, contra la cuenta.
 */
export function checkPasswordChange({ current, next, repeat }: PasswordChangeInput): Partial<Record<PasswordChangeField, string>> {
  const errors: Partial<Record<PasswordChangeField, string>> = {};
  if (!current) errors.current = "Escribe tu contraseña actual.";
  if (!next) errors.next = "Escribe la contraseña nueva.";
  else if (next.length < PASSWORD_MIN_LENGTH) errors.next = `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  else if (next.length > PASSWORD_MAX_LENGTH) errors.next = `Debe tener máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  else if (next === current) errors.next = "Debe ser distinta de la actual.";
  if (!errors.next && repeat !== next) errors.repeat = "No coincide con la contraseña nueva.";
  return errors;
}
