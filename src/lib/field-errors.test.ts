import { describe, expect, it } from "vitest";
import { EMAIL_MESSAGE, FIELD_TEXTS, TOTP_CODE_MESSAGES, fieldErrorMessage, type FieldState } from "./field-errors";

// Lo que dice el navegador de un campo (ValidityState): todo en orden salvo lo que diga cada prueba.
const field = (validity: Partial<FieldState["validity"]>, overrides: Partial<FieldState> = {}): FieldState => ({
  validity: {
    valid: false,
    valueMissing: false,
    typeMismatch: false,
    tooShort: false,
    tooLong: false,
    patternMismatch: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    badInput: false,
    ...validity,
  },
  type: "text",
  value: "",
  minLength: -1,
  maxLength: -1,
  ...overrides,
});

describe("fieldErrorMessage", () => {
  it("un campo válido no tiene mensaje", () => {
    expect(fieldErrorMessage(field({ valid: true }))).toBeNull();
    expect(fieldErrorMessage(field({ valid: true, valueMissing: true }), { required: "x" })).toBeNull();
  });

  it("vacío: el mensaje del campo o el general", () => {
    expect(fieldErrorMessage(field({ valueMissing: true }), { required: "Escribe tu nombre." })).toBe("Escribe tu nombre.");
    expect(fieldErrorMessage(field({ valueMissing: true }))).toBe("Completa este campo.");
  });

  it("vacío va antes que cualquier otro problema", () => {
    expect(fieldErrorMessage(field({ valueMissing: true, patternMismatch: true }), { required: "A", pattern: "B" })).toBe("A");
  });

  it("un correo mal escrito", () => {
    expect(fieldErrorMessage(field({ typeMismatch: true }, { type: "email" }))).toBe(EMAIL_MESSAGE);
    expect(EMAIL_MESSAGE).toBe("Revisa el correo: debe verse como nombre@correo.com.");
    expect(fieldErrorMessage(field({ typeMismatch: true }, { type: "email" }), { email: "Otro" })).toBe("Otro");
    // Otro tipo mal escrito (p. ej. una URL), el general.
    expect(fieldErrorMessage(field({ typeMismatch: true }, { type: "url" }))).toBe("Revisa este campo.");
  });

  it("muy corto: cuántos pide y cuántos lleva", () => {
    expect(fieldErrorMessage(field({ tooShort: true }, { minLength: 8, value: "abcde" }))).toBe(
      "Debe tener al menos 8 caracteres (llevas 5).",
    );
    expect(
      fieldErrorMessage(field({ tooShort: true }, { minLength: 8, value: "ab" }), { tooShort: (min, length) => `${min}-${length}` }),
    ).toBe("8-2");
  });

  it("muy largo", () => {
    expect(fieldErrorMessage(field({ tooLong: true }, { maxLength: 40 }))).toBe("Debe tener máximo 40 caracteres.");
  });

  it("formato: el del campo o el general", () => {
    expect(fieldErrorMessage(field({ patternMismatch: true }), TOTP_CODE_MESSAGES)).toBe("El código tiene 6 dígitos, solo números.");
    expect(fieldErrorMessage(field({ patternMismatch: true }))).toBe("Revisa el formato.");
  });

  it("mayor que el máximo: el del campo (p. ej. una fecha futura) o el general", () => {
    expect(fieldErrorMessage(field({ rangeOverflow: true }), { max: "La fecha no puede ser después de hoy." })).toBe(
      "La fecha no puede ser después de hoy.",
    );
    expect(fieldErrorMessage(field({ rangeOverflow: true }))).toBe("Revisa este campo.");
  });

  it("cualquier otro problema: el general", () => {
    expect(fieldErrorMessage(field({ rangeUnderflow: true }))).toBe("Revisa este campo.");
    expect(fieldErrorMessage(field({}))).toBe("Revisa este campo.");
  });

  it("los del código de Google Authenticator", () => {
    expect(TOTP_CODE_MESSAGES).toEqual({
      required: "Escribe el código de 6 dígitos de Google Authenticator.",
      pattern: "El código tiene 6 dígitos, solo números.",
    });
  });

  it("un campo numérico fuera de rango, con decimales o que no es un número: su mensaje", () => {
    const number = { number: "Escribe un número entre 0 y 10." };
    for (const problem of ["rangeUnderflow", "rangeOverflow", "stepMismatch", "badInput"] as const) {
      expect(fieldErrorMessage(field({ [problem]: true }, { type: "number" }), number), problem).toBe("Escribe un número entre 0 y 10.");
      expect(fieldErrorMessage(field({ [problem]: true }, { type: "number" })), problem).toBe("Revisa este campo.");
    }
    // Vacío y obligatorio dice lo suyo; una fecha futura, el de max.
    expect(fieldErrorMessage(field({ valueMissing: true }, { type: "number" }), { ...number, required: "Escribe cuántos días." })).toBe("Escribe cuántos días.");
    expect(fieldErrorMessage(field({ rangeOverflow: true }), { max: "No puede ser después de hoy.", ...number })).toBe("No puede ser después de hoy.");
  });
});

describe("fieldErrorMessage · en inglés", () => {
  it("los mensajes generales y el del correo, en inglés; los propios del campo, como vengan", () => {
    expect(fieldErrorMessage(field({ valueMissing: true }), {}, "en")).toBe("Fill out this field.");
    expect(fieldErrorMessage(field({ typeMismatch: true }, { type: "email" }), {}, "en")).toBe("Check the email: it should look like name@email.com.");
    expect(fieldErrorMessage(field({ tooShort: true }, { minLength: 8, value: "abc" }), {}, "en")).toBe("It must have at least 8 characters (you have 3).");
    expect(fieldErrorMessage(field({ tooLong: true }, { maxLength: 40 }), {}, "en")).toBe("It must have at most 40 characters.");
    expect(fieldErrorMessage(field({ patternMismatch: true }), {}, "en")).toBe("Check the format.");
    expect(fieldErrorMessage(field({ badInput: true }), {}, "en")).toBe("Check this field.");
    expect(fieldErrorMessage(field({ valueMissing: true }), { required: "Enter your name." }, "en")).toBe("Enter your name.");
    expect(fieldErrorMessage(field({ patternMismatch: true }), FIELD_TEXTS.en.totpCode, "en")).toBe("The code has 6 digits, numbers only.");
  });

  it("en español, los de siempre", () => {
    expect(FIELD_TEXTS.es.email).toBe(EMAIL_MESSAGE);
    expect(FIELD_TEXTS.es.totpCode).toBe(TOTP_CODE_MESSAGES);
  });
});
