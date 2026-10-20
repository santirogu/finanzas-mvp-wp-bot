import { describe, expect, it } from "vitest";
import { checkPasswordChange, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-change";

const check = (current: string, next: string, repeat = next) => checkPasswordChange({ current, next, repeat });

describe("checkPasswordChange", () => {
  it("las mismas reglas del registro: de 8 a 128 caracteres", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it("todo bien: sin errores", () => {
    expect(check("clave-vieja-1", "clave-nueva-2")).toEqual({});
    expect(check("x", "a".repeat(8))).toEqual({});
    expect(check("x", "a".repeat(128))).toEqual({});
  });

  it("sin la actual", () => {
    expect(check("", "clave-nueva-2")).toEqual({ current: "Escribe tu contraseña actual." });
  });

  it("sin la nueva (y entonces no revisa la repetición)", () => {
    expect(check("clave-vieja-1", "", "algo")).toEqual({ next: "Escribe la contraseña nueva." });
  });

  it("la nueva muy corta o muy larga", () => {
    expect(check("x", "a".repeat(7))).toEqual({ next: "Debe tener al menos 8 caracteres." });
    expect(check("x", "a".repeat(129))).toEqual({ next: "Debe tener máximo 128 caracteres." });
  });

  it("la nueva igual a la actual", () => {
    expect(check("clave-vieja-1", "clave-vieja-1")).toEqual({ next: "Debe ser distinta de la actual." });
  });

  it("la repetición distinta de la nueva", () => {
    expect(check("clave-vieja-1", "clave-nueva-2", "clave-nueva-3")).toEqual({ repeat: "No coincide con la contraseña nueva." });
  });

  it("varios a la vez", () => {
    expect(check("", "corta", "otra")).toEqual({
      current: "Escribe tu contraseña actual.",
      next: "Debe tener al menos 8 caracteres.",
    });
  });
});

describe("checkPasswordChange · en inglés", () => {
  it("los mensajes de cada campo, en inglés", () => {
    expect(checkPasswordChange({ current: "", next: "", repeat: "" }, "en")).toEqual({ current: "Enter your current password.", next: "Enter the new password." });
    expect(checkPasswordChange({ current: "a", next: "corta", repeat: "corta" }, "en")).toEqual({ next: "It must have at least 8 characters." });
    expect(checkPasswordChange({ current: "a", next: "x".repeat(129), repeat: "" }, "en")).toEqual({ next: "It must have at most 128 characters." });
    expect(checkPasswordChange({ current: "clave-segura", next: "clave-segura", repeat: "clave-segura" }, "en")).toEqual({ next: "It must be different from the current one." });
    expect(checkPasswordChange({ current: "a", next: "clave-segura", repeat: "otra" }, "en")).toEqual({ repeat: "It doesn't match the new password." });
  });
});
