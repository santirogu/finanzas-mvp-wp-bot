// Los mensajes de error de los campos, en el idioma de la página. El navegador valida los campos
// (obligatorio, correo, largo mínimo, formato, fecha máxima) y, si algo falla, muestra un globo en el idioma
// del navegador ("Please fill out this field."). La app lo reemplaza por estos mensajes, debajo de cada
// campo (src/components/use-field-errors.ts).

import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";

/** Lo que dice cada campo según lo que le falte; lo que no se diga, usa el mensaje general. */
export type FieldMessages = {
  /** Vacío y obligatorio. */
  required?: string;
  /** Un correo mal escrito. */
  email?: string;
  /** Más corto que su minLength. */
  tooShort?: (min: number, length: number) => string;
  /** No cumple su pattern (p. ej. un código de 6 dígitos). */
  pattern?: string;
  /** Mayor que su max (p. ej. una fecha futura). */
  max?: string;
  /** Un campo numérico (type="number") fuera de su rango, con decimales o con algo que no es un número. */
  number?: string;
};

/** Lo que el navegador dice de un campo (ValidityState) y lo necesario para el mensaje. */
export type FieldState = {
  validity: Pick<
    ValidityState,
    | "valid"
    | "valueMissing"
    | "typeMismatch"
    | "tooShort"
    | "tooLong"
    | "patternMismatch"
    | "rangeOverflow"
    | "rangeUnderflow"
    | "stepMismatch"
    | "badInput"
  >;
  type: string;
  value: string;
  minLength: number;
  maxLength: number;
};

export const FIELD_TEXTS = texts(
  {
    email: "Revisa el correo: debe verse como nombre@correo.com.",
    /** El código de Google Authenticator: lo piden el login de los admins, Seguridad y las acciones del admin. */
    totpCode: {
      required: "Escribe el código de 6 dígitos de Google Authenticator.",
      pattern: "El código tiene 6 dígitos, solo números.",
    } satisfies FieldMessages,
    /** Lo que se dice si el campo no tiene un mensaje propio para ese problema. */
    general: {
      required: "Completa este campo.",
      tooShort: (min: number, length: number) => `Debe tener al menos ${min} caracteres (llevas ${length}).`,
      tooLong: (max: number) => `Debe tener máximo ${max} caracteres.`,
      pattern: "Revisa el formato.",
      other: "Revisa este campo.",
    },
  },
  {
    en: {
      email: "Check the email: it should look like name@email.com.",
      totpCode: {
        required: "Enter the 6-digit code from Google Authenticator.",
        pattern: "The code has 6 digits, numbers only.",
      },
      general: {
        required: "Fill out this field.",
        tooShort: (min, length) => `It must have at least ${min} characters (you have ${length}).`,
        tooLong: (max) => `It must have at most ${max} characters.`,
        pattern: "Check the format.",
        other: "Check this field.",
      },
    },
  },
);

// En español, para los formularios que todavía no tienen sus textos en inglés.
export const EMAIL_MESSAGE = FIELD_TEXTS.es.email;
export const TOTP_CODE_MESSAGES: FieldMessages = FIELD_TEXTS.es.totpCode;

/** El mensaje del primer problema del campo, o null si está bien. Lo general va en el idioma de la página. */
export function fieldErrorMessage(field: FieldState, messages: FieldMessages = {}, locale: Locale = DEFAULT_LOCALE): string | null {
  const { validity } = field;
  const { general, email } = FIELD_TEXTS[locale];
  if (validity.valid) return null;
  if (validity.valueMissing) return messages.required ?? general.required;
  if (validity.typeMismatch && field.type === "email") return messages.email ?? email;
  if (validity.tooShort) return (messages.tooShort ?? general.tooShort)(field.minLength, field.value.length);
  if (validity.tooLong) return general.tooLong(field.maxLength);
  if (validity.patternMismatch) return messages.pattern ?? general.pattern;
  if (validity.rangeOverflow && messages.max) return messages.max;
  if ((validity.rangeUnderflow || validity.rangeOverflow || validity.stepMismatch || validity.badInput) && messages.number) return messages.number;
  return general.other;
}
