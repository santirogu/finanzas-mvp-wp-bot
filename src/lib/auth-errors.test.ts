import { describe, expect, it } from "vitest";
import { ACCOUNT_LOCKED, ACCOUNT_SUSPENDED, TOO_MANY_ATTEMPTS, authErrorMessage } from "./auth-errors";
import { CONTACT_EMAIL } from "./contact";

describe("authErrorMessage", () => {
  it("traduce los errores conocidos de Better Auth", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" })).toBe(
      "Correo o contraseña incorrectos.",
    );
    expect(authErrorMessage({ code: "USER_ALREADY_EXISTS" })).toBe("Ya existe una cuenta con ese correo.");
    expect(authErrorMessage({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" })).toBe(
      "Ya existe una cuenta con ese correo.",
    );
    expect(authErrorMessage({ code: "PASSWORD_TOO_SHORT" })).toBe(
      "La contraseña debe tener al menos 8 caracteres.",
    );
    expect(authErrorMessage({ code: "INVALID_EMAIL" })).toBe("El correo no es válido.");
    expect(authErrorMessage({ code: "PASSWORD_TOO_LONG", message: "Password too long" })).toBe(
      "La contraseña puede tener máximo 128 caracteres.",
    );
  });

  it("el nombre inválido llega del servidor con su mensaje en español", () => {
    expect(authErrorMessage({ status: 400, code: "INVALID_NAME", message: "El nombre puede tener máximo 80 caracteres." })).toBe(
      "El nombre puede tener máximo 80 caracteres.",
    );
  });

  it("avisa en español cuando se superó el límite de intentos (429, sin código)", () => {
    expect(
      authErrorMessage({ status: 429, message: "Too many requests. Please try again later." }),
    ).toBe(TOO_MANY_ATTEMPTS);
    expect(TOO_MANY_ATTEMPTS).toBe("Demasiados intentos. Espera unos segundos y vuelve a intentarlo.");
  });

  it("el límite de intentos tiene prioridad sobre cualquier código", () => {
    expect(authErrorMessage({ status: 429, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(TOO_MANY_ATTEMPTS);
  });

  it("con la cuenta suspendida dice cómo escribirnos, sin el motivo", () => {
    expect(ACCOUNT_SUSPENDED).toBe(`Tu cuenta está suspendida. Si crees que es un error, escríbenos a ${CONTACT_EMAIL}.`);
    expect(authErrorMessage({ status: 403, code: "ACCOUNT_SUSPENDED", message: "otro texto" })).toBe(ACCOUNT_SUSPENDED);
    expect(authErrorMessage({ code: "ACCOUNT_SUSPENDED" })).toBe(ACCOUNT_SUSPENDED);
  });

  it("con la cuenta bloqueada muestra el mensaje del servidor (con los minutos que faltan)", () => {
    const message = "Por seguridad, la cuenta quedó bloqueada por varios intentos fallidos. Intenta de nuevo en 12 minutos.";
    expect(authErrorMessage({ status: 429, code: "ACCOUNT_LOCKED", message })).toBe(message);
    expect(authErrorMessage({ status: 429, code: "ACCOUNT_LOCKED" })).toBe(ACCOUNT_LOCKED);
    expect(ACCOUNT_LOCKED).toBe(
      "Por seguridad, la cuenta quedó bloqueada por varios intentos fallidos. Intenta más tarde.",
    );
  });

  it("traduce los errores de la verificación en dos pasos", () => {
    expect(authErrorMessage({ status: 401, code: "INVALID_CODE", message: "Invalid code" })).toBe(
      "Código incorrecto. Escribe el código que muestra Google Authenticator ahora.",
    );
    expect(authErrorMessage({ status: 401, code: "INVALID_BACKUP_CODE" })).toBe(
      "Ese código de respaldo no es válido o ya se usó.",
    );
    expect(authErrorMessage({ status: 401, code: "INVALID_TWO_FACTOR_COOKIE" })).toBe(
      "Pasaron más de 10 minutos. Vuelve a escribir tu correo y contraseña.",
    );
    expect(authErrorMessage({ status: 401, code: "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" })).toBe(
      "Demasiados intentos en este inicio de sesión. Vuelve a escribir tu correo y contraseña.",
    );
    expect(authErrorMessage({ status: 400, code: "INVALID_PASSWORD" })).toBe("Contraseña incorrecta.");
    expect(authErrorMessage({ status: 400, code: "TOTP_ALREADY_ENABLED" })).toBe(
      "La verificación en dos pasos ya está activa.",
    );
    expect(authErrorMessage({ status: 403, code: "ADMIN_ONLY" })).toBe(
      "La verificación en dos pasos es solo para administradores.",
    );
    expect(authErrorMessage({ status: 403, code: "TWO_FACTOR_ALREADY_VERIFIED", message: "x" })).toBe(
      "La verificación en dos pasos ya está activa.",
    );
  });

  it("el bloqueo de la verificación en dos pasos (429) tiene su propio mensaje", () => {
    expect(authErrorMessage({ status: 429, code: "ACCOUNT_TEMPORARILY_LOCKED", message: "Too many failed..." })).toBe(
      "Demasiados códigos incorrectos. Por seguridad, la verificación quedó bloqueada 15 minutos.",
    );
  });

  it("sin traducción, muestra el mensaje del servidor o uno genérico", () => {
    expect(authErrorMessage({ code: "OTRO_CODIGO", message: "Mensaje del servidor" })).toBe("Mensaje del servidor");
    expect(authErrorMessage({ status: 500, message: "Error interno" })).toBe("Error interno");
    expect(authErrorMessage({ code: "OTRO_CODIGO" })).toBe("Algo salió mal.");
    expect(authErrorMessage({})).toBe("Algo salió mal.");
  });
});
