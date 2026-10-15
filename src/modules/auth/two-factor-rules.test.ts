import { describe, expect, it } from "vitest";
import {
  TWO_FACTOR_DISABLED_PATHS,
  TWO_FACTOR_ERRORS,
  TWO_FACTOR_ISSUER,
  TWO_FACTOR_LOCKOUT,
  manualKeyFromUri,
  twoFactorViolation,
} from "./two-factor-rules";

describe("configuración", () => {
  it("Google Authenticator muestra la app como Finanzas MVP", () => {
    expect(TWO_FACTOR_ISSUER).toBe("Finanzas MVP");
  });

  it("bloquea 15 minutos tras 5 códigos incorrectos (como el login)", () => {
    expect(TWO_FACTOR_LOCKOUT).toEqual({ maxFailedAttempts: 5, durationSeconds: 900 });
  });

  it("apaga lo que permitiría desactivarla o llevarse la clave", () => {
    expect(TWO_FACTOR_DISABLED_PATHS).toEqual([
      "/two-factor/disable",
      "/two-factor/get-totp-uri",
      "/two-factor/generate-backup-codes",
      "/two-factor/send-otp",
      "/two-factor/verify-otp",
    ]);
  });

  it("los errores propios tienen código y mensaje en español", () => {
    expect(TWO_FACTOR_ERRORS).toEqual({
      ADMIN_ONLY: { code: "ADMIN_ONLY", message: "La verificación en dos pasos es solo para administradores." },
      TRUST_DEVICE_NOT_ALLOWED: {
        code: "TRUST_DEVICE_NOT_ALLOWED",
        message: "Aquí no se puede recordar el dispositivo: el código se pide en cada inicio de sesión.",
      },
    });
  });
});

describe("twoFactorViolation", () => {
  it("solo un admin puede activarla", () => {
    expect(twoFactorViolation({ path: "/two-factor/enable", body: {}, isAdmin: false })).toBe("ADMIN_ONLY");
    expect(twoFactorViolation({ path: "/two-factor/enable", body: {}, isAdmin: true })).toBeNull();
  });

  it("sin sesión deja que el endpoint responda 401 por su cuenta", () => {
    expect(twoFactorViolation({ path: "/two-factor/enable", body: {}, isAdmin: null })).toBeNull();
  });

  it.each(["/two-factor/verify-totp", "/two-factor/verify-backup-code"])(
    "%s no acepta recordar el dispositivo",
    (path) => {
      for (const trustDevice of [true, "true", 1]) {
        expect(twoFactorViolation({ path, body: { code: "123456", trustDevice }, isAdmin: null })).toBe(
          "TRUST_DEVICE_NOT_ALLOWED",
        );
      }
      for (const body of [{ code: "123456" }, { code: "123456", trustDevice: false }, null, undefined]) {
        expect(twoFactorViolation({ path, body, isAdmin: null })).toBeNull();
      }
    },
  );

  it("recordar el dispositivo en otra ruta no es asunto de esta regla", () => {
    expect(twoFactorViolation({ path: "/sign-in/email", body: { trustDevice: true }, isAdmin: false })).toBeNull();
    expect(twoFactorViolation({ path: "/two-factor/enable", body: { trustDevice: true }, isAdmin: true })).toBeNull();
  });
});

describe("manualKeyFromUri", () => {
  it("separa la clave en grupos de 4 para escribirla a mano", () => {
    expect(manualKeyFromUri("otpauth://totp/Finanzas%20MVP:ana?secret=ABCDEFGHIJKLMN&issuer=Finanzas+MVP")).toBe(
      "ABCD EFGH IJKL MN",
    );
  });

  it("sin clave o con un URI inválido devuelve null", () => {
    expect(manualKeyFromUri("otpauth://totp/x?issuer=y")).toBeNull();
    expect(manualKeyFromUri("otpauth://totp/x?secret=")).toBeNull();
    expect(manualKeyFromUri("esto no es un uri")).toBeNull();
  });
});
