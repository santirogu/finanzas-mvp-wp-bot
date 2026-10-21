import { describe, expect, it } from "vitest";
import {
  TWO_FACTOR_CODE_PATHS,
  TWO_FACTOR_DISABLED_PATHS,
  TWO_FACTOR_ERRORS,
  TWO_FACTOR_ISSUER,
  TWO_FACTOR_LOCKOUT,
  manualKeyFromUri,
  needsSession,
  twoFactorViolation,
} from "./two-factor-rules";

const admin = { isAdmin: true, twoFactorEnabled: false };
const user = { isAdmin: false, twoFactorEnabled: false };
const verifiedAdmin = { isAdmin: true, twoFactorEnabled: true };

describe("configuración", () => {
  it("Google Authenticator muestra la app como Anotado", () => {
    expect(TWO_FACTOR_ISSUER).toBe("Anotado");
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
      ALREADY_VERIFIED: {
        code: "TWO_FACTOR_ALREADY_VERIFIED",
        message: "La verificación en dos pasos ya está activa: el código se pide al entrar y al confirmar cada acción.",
      },
    });
  });

  it("las rutas donde se escribe un código", () => {
    expect(TWO_FACTOR_CODE_PATHS).toEqual(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);
  });
});

describe("needsSession", () => {
  it("el hook lee la sesión para activar la verificación y para los códigos", () => {
    expect(needsSession("/two-factor/enable")).toBe(true);
    expect(needsSession("/two-factor/verify-totp")).toBe(true);
    expect(needsSession("/two-factor/verify-backup-code")).toBe(true);
  });

  it("y en ninguna otra ruta (no la consulta de más)", () => {
    for (const path of ["/sign-in/email", "/two-factor/disable", "/two-factor/verify-otp", "/two-factor"]) {
      expect(needsSession(path), path).toBe(false);
    }
  });
});

describe("twoFactorViolation", () => {
  it("solo un admin puede activarla", () => {
    expect(twoFactorViolation({ path: "/two-factor/enable", body: {}, session: user })).toBe("ADMIN_ONLY");
    expect(twoFactorViolation({ path: "/two-factor/enable", body: {}, session: admin })).toBeNull();
  });

  it("sin sesión deja que el endpoint responda 401 por su cuenta", () => {
    expect(twoFactorViolation({ path: "/two-factor/enable", body: {}, session: null })).toBeNull();
  });

  it.each(["/two-factor/verify-totp", "/two-factor/verify-backup-code"])(
    "%s no acepta recordar el dispositivo",
    (path) => {
      for (const trustDevice of [true, "true", 1]) {
        expect(twoFactorViolation({ path, body: { code: "123456", trustDevice }, session: null })).toBe(
          "TRUST_DEVICE_NOT_ALLOWED",
        );
      }
      for (const body of [{ code: "123456" }, { code: "123456", trustDevice: false }, null, undefined]) {
        expect(twoFactorViolation({ path, body, session: null })).toBeNull();
      }
    },
  );

  it.each(["/two-factor/verify-totp", "/two-factor/verify-backup-code"])(
    "%s con la verificación ya activa solo sirve para entrar (sin sesión)",
    (path) => {
      expect(twoFactorViolation({ path, body: { code: "123456" }, session: verifiedAdmin })).toBe("ALREADY_VERIFIED");
      // Al configurarla, con sesión y todavía sin activar, sí.
      expect(twoFactorViolation({ path, body: { code: "123456" }, session: admin })).toBeNull();
      // Al entrar todavía no hay sesión.
      expect(twoFactorViolation({ path, body: { code: "123456" }, session: null })).toBeNull();
    },
  );

  it("recordar el dispositivo se rechaza aunque la verificación ya esté activa", () => {
    expect(
      twoFactorViolation({ path: "/two-factor/verify-totp", body: { trustDevice: true }, session: verifiedAdmin }),
    ).toBe("TRUST_DEVICE_NOT_ALLOWED");
  });

  it("otras rutas no son asunto de esta regla", () => {
    expect(twoFactorViolation({ path: "/sign-in/email", body: { trustDevice: true }, session: user })).toBeNull();
    expect(twoFactorViolation({ path: "/two-factor/enable", body: { trustDevice: true }, session: admin })).toBeNull();
    expect(twoFactorViolation({ path: "/two-factor/enable", body: {}, session: verifiedAdmin })).toBeNull();
    expect(twoFactorViolation({ path: "/sign-in/email", body: {}, session: verifiedAdmin })).toBeNull();
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
