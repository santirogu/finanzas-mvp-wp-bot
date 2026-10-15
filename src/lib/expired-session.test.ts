import { describe, expect, it } from "vitest";
import { EXPIRED_SESSION_LOGIN, EXPIRED_SESSION_PARAM, SESSION_COOKIE_NAMES } from "./expired-session";

describe("sesión vencida", () => {
  it("manda al login con ?sesion=vencida", () => {
    expect(EXPIRED_SESSION_PARAM).toEqual({ name: "sesion", value: "vencida" });
    expect(EXPIRED_SESSION_LOGIN).toBe("/login?sesion=vencida");
  });

  it("conoce las cookies de sesión de Better Auth, con y sin el prefijo __Secure-", () => {
    expect(SESSION_COOKIE_NAMES).toEqual([
      "better-auth.session_token",
      "__Secure-better-auth.session_token",
      "better-auth.session_data",
      "__Secure-better-auth.session_data",
      "better-auth.dont_remember",
      "__Secure-better-auth.dont_remember",
    ]);
  });
});
