// Las reglas del formulario "Cambiar contraseña" de Mi cuenta (src/modules/account/actions.ts), sin
// dependencias: las usan el servidor y las pruebas. Las mismas del registro (src/lib/auth.ts).

import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordChangeField = "current" | "next" | "repeat" | "code";
export type PasswordChangeInput = { current: string; next: string; repeat: string };

const TEXTS = texts(
  {
    current: "Escribe tu contraseña actual.",
    next: "Escribe la contraseña nueva.",
    tooShort: `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    tooLong: `Debe tener máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
    same: "Debe ser distinta de la actual.",
    repeat: "No coincide con la contraseña nueva.",
    wrong: "Contraseña incorrecta.",
    unverified: "No pudimos verificar tu contraseña. Cierra sesión y vuelve a entrar.",
  },
  {
    en: {
      current: "Enter your current password.",
      next: "Enter the new password.",
      tooShort: `It must have at least ${PASSWORD_MIN_LENGTH} characters.`,
      tooLong: `It must have at most ${PASSWORD_MAX_LENGTH} characters.`,
      same: "It must be different from the current one.",
      repeat: "It doesn't match the new password.",
      wrong: "Wrong password.",
      unverified: "We couldn't verify your password. Sign out and sign in again.",
    },
  },
);

/** Los mensajes de las contraseñas de Mi cuenta (también los de la acción: la equivocada y la que no se pudo verificar). */
export const PASSWORD_TEXTS = TEXTS;

/**
 * Los errores de cada campo (vacío si está todo bien), en el idioma de la página: la actual, la nueva
 * (largo y distinta de la actual) y la repetición. La actual se revisa después, contra la cuenta.
 */
export function checkPasswordChange(
  { current, next, repeat }: PasswordChangeInput,
  locale: Locale = DEFAULT_LOCALE,
): Partial<Record<PasswordChangeField, string>> {
  const t = TEXTS[locale];
  const errors: Partial<Record<PasswordChangeField, string>> = {};
  if (!current) errors.current = t.current;
  if (!next) errors.next = t.next;
  else if (next.length < PASSWORD_MIN_LENGTH) errors.next = t.tooShort;
  else if (next.length > PASSWORD_MAX_LENGTH) errors.next = t.tooLong;
  else if (next === current) errors.next = t.same;
  if (!errors.next && repeat !== next) errors.repeat = t.repeat;
  return errors;
}
