// Los mensajes de error de los campos, en español. El navegador valida los campos (obligatorio,
// correo, largo mínimo, formato, fecha máxima) y, si algo falla, muestra un globo en el idioma del
// navegador ("Please fill out this field."). La app lo reemplaza por estos mensajes, debajo de cada
// campo (src/components/use-field-errors.ts). Sin dependencias: se prueba solo.

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

export const EMAIL_MESSAGE = "Revisa el correo: debe verse como nombre@correo.com.";

/** El código de Google Authenticator: lo piden el login de los admins, Seguridad y las acciones del admin. */
export const TOTP_CODE_MESSAGES: FieldMessages = {
  required: "Escribe el código de 6 dígitos de Google Authenticator.",
  pattern: "El código tiene 6 dígitos, solo números.",
};

const GENERAL = {
  required: "Completa este campo.",
  tooShort: (min: number, length: number) => `Debe tener al menos ${min} caracteres (llevas ${length}).`,
  tooLong: (max: number) => `Debe tener máximo ${max} caracteres.`,
  pattern: "Revisa el formato.",
  other: "Revisa este campo.",
};

/** El mensaje del primer problema del campo, o null si está bien. */
export function fieldErrorMessage(field: FieldState, messages: FieldMessages = {}): string | null {
  const { validity } = field;
  if (validity.valid) return null;
  if (validity.valueMissing) return messages.required ?? GENERAL.required;
  if (validity.typeMismatch && field.type === "email") return messages.email ?? EMAIL_MESSAGE;
  if (validity.tooShort) return (messages.tooShort ?? GENERAL.tooShort)(field.minLength, field.value.length);
  if (validity.tooLong) return GENERAL.tooLong(field.maxLength);
  if (validity.patternMismatch) return messages.pattern ?? GENERAL.pattern;
  if (validity.rangeOverflow && messages.max) return messages.max;
  if ((validity.rangeUnderflow || validity.rangeOverflow || validity.stepMismatch || validity.badInput) && messages.number) return messages.number;
  return GENERAL.other;
}
