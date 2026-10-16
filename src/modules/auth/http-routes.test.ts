import { describe, expect, it } from "vitest";
import { AUTH_BASE_PATH, AUTH_DISABLED_PATHS, AUTH_HTTP_ROUTES, isAuthRouteAllowed } from "./http-routes";
import { TWO_FACTOR_DISABLED_PATHS } from "./two-factor-rules";

describe("AUTH_HTTP_ROUTES", () => {
  it("solo las rutas que la app usa desde el navegador", () => {
    expect(Object.keys(AUTH_HTTP_ROUTES)).toEqual([
      "POST /sign-up/email",
      "POST /sign-in/email",
      "POST /two-factor/enable",
      "POST /two-factor/verify-totp",
      "POST /two-factor/verify-backup-code",
    ]);
  });

  it("cada una dice quién la usa", () => {
    for (const usedBy of Object.values(AUTH_HTTP_ROUTES)) expect(usedBy).toMatch(/\S{10,}/);
  });
});

describe("AUTH_DISABLED_PATHS", () => {
  it("incluye las de la verificación en dos pasos y las que esquivaban los bloqueos", () => {
    for (const path of [...TWO_FACTOR_DISABLED_PATHS, "/verify-password", "/change-password", "/update-user"]) {
      expect(AUTH_DISABLED_PATHS).toContain(path);
    }
  });

  it("no apaga ninguna de las que se usan, ni repite", () => {
    const allowed = Object.keys(AUTH_HTTP_ROUTES).map((route) => route.split(" ")[1]);
    for (const path of AUTH_DISABLED_PATHS) expect(allowed, path).not.toContain(path);
    expect(new Set(AUTH_DISABLED_PATHS).size).toBe(AUTH_DISABLED_PATHS.length);
  });
});

describe("isAuthRouteAllowed", () => {
  it("deja pasar las rutas de la lista, con su método", () => {
    expect(AUTH_BASE_PATH).toBe("/api/auth");
    for (const route of Object.keys(AUTH_HTTP_ROUTES)) {
      const [method, path] = route.split(" ");
      expect(isAuthRouteAllowed(method, `/api/auth${path}`), route).toBe(true);
    }
    // El método puede venir en minúsculas.
    expect(isAuthRouteAllowed("post", "/api/auth/sign-in/email")).toBe(true);
  });

  it("rechaza otro método en una ruta permitida", () => {
    expect(isAuthRouteAllowed("GET", "/api/auth/sign-in/email")).toBe(false);
    expect(isAuthRouteAllowed("PUT", "/api/auth/two-factor/enable")).toBe(false);
  });

  it.each([
    ["una ruta apagada", "/api/auth/verify-password"],
    ["la sesión (se lee desde el servidor)", "/api/auth/get-session"],
    ["una ruta con parámetros", "/api/auth/callback/google"],
    ["una ruta que no existe", "/api/auth/admin/set-role"],
    ["la base sola", "/api/auth"],
    ["la base con barra", "/api/auth/"],
    ["con barra al final", "/api/auth/sign-in/email/"],
    ["en mayúsculas", "/api/auth/SIGN-IN/email"],
    ["codificada", "/api/auth/sign-in/%65mail"],
    ["fuera de /api/auth", "/sign-in/email"],
    ["con otro prefijo", "/api/authx/sign-in/email"],
    ["con otro prefijo del mismo largo", "/api/xxxx/sign-in/email"],
    ["un nombre del prototipo", "/api/auth/constructor"],
  ])("rechaza %s", (_, pathname) => {
    expect(isAuthRouteAllowed("POST", pathname)).toBe(false);
  });
});
