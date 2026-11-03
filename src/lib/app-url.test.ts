import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppUrl, getVercelOrigins } from "./app-url";

beforeEach(() => {
  for (const name of [
    "BETTER_AUTH_URL",
    "APP_PUBLIC_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL",
    "VERCEL_BRANCH_URL",
  ]) {
    vi.stubEnv(name, "");
  }
});
afterEach(() => vi.unstubAllEnvs());

describe("getAppUrl", () => {
  it("prioriza BETTER_AUTH_URL (dominio propio) y le quita la barra final", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://finanzas.co/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "finanzas-mvp-wp-bot.vercel.app");
    expect(getAppUrl()).toBe("https://finanzas.co");
  });

  it("en Vercel usa la URL de producción del proyecto", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "finanzas-mvp-wp-bot.vercel.app");
    expect(getAppUrl()).toBe("https://finanzas-mvp-wp-bot.vercel.app");
  });

  it("en local usa localhost:3000", () => {
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("la de producción que fijó el build (PRODUCTION_URL del despliegue) va antes que la de Vercel", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "finanzas-mvp-wp-bot.vercel.app");
    expect(getAppUrl({ built: "https://anotadoapp.vercel.app/" })).toBe("https://anotadoapp.vercel.app");
    // BETTER_AUTH_URL sigue mandando (las E2E).
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
    expect(getAppUrl({ built: "https://anotadoapp.vercel.app" })).toBe("http://localhost:3100");
  });

  it("por defecto lee APP_PUBLIC_URL (lo que fija next.config.ts); vacía no cuenta", () => {
    vi.stubEnv("APP_PUBLIC_URL", "https://anotadoapp.vercel.app");
    expect(getAppUrl()).toBe("https://anotadoapp.vercel.app");
    vi.stubEnv("APP_PUBLIC_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});

describe("getVercelOrigins", () => {
  it("acepta la URL del despliegue y la de la rama", () => {
    vi.stubEnv("VERCEL_URL", "finanzas-abc123.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "finanzas-git-main.vercel.app");
    expect(getVercelOrigins()).toEqual([
      "https://finanzas-abc123.vercel.app",
      "https://finanzas-git-main.vercel.app",
    ]);
  });

  it("fuera de Vercel no agrega orígenes", () => {
    expect(getVercelOrigins()).toEqual([]);
  });
});
