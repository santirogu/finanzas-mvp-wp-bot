import { describe, expect, it } from "vitest";
import { ACCOUNT_LOCKED, TOO_MANY_ATTEMPTS, authErrorMessage } from "./auth-errors";

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

  it("con la cuenta bloqueada muestra el mensaje del servidor (con los minutos que faltan)", () => {
    const message = "Por seguridad, la cuenta quedó bloqueada por varios intentos fallidos. Intenta de nuevo en 12 minutos.";
    expect(authErrorMessage({ status: 429, code: "ACCOUNT_LOCKED", message })).toBe(message);
    expect(authErrorMessage({ status: 429, code: "ACCOUNT_LOCKED" })).toBe(ACCOUNT_LOCKED);
    expect(ACCOUNT_LOCKED).toBe(
      "Por seguridad, la cuenta quedó bloqueada por varios intentos fallidos. Intenta más tarde.",
    );
  });

  it("sin traducción, muestra el mensaje del servidor o uno genérico", () => {
    expect(authErrorMessage({ code: "OTRO_CODIGO", message: "Mensaje del servidor" })).toBe("Mensaje del servidor");
    expect(authErrorMessage({ status: 500, message: "Error interno" })).toBe("Error interno");
    expect(authErrorMessage({ code: "OTRO_CODIGO" })).toBe("Algo salió mal.");
    expect(authErrorMessage({})).toBe("Algo salió mal.");
  });
});
