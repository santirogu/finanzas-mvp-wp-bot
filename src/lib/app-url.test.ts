import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppUrl, getVercelOrigins } from "./app-url";

beforeEach(() => {
  for (const name of [
    "BETTER_AUTH_URL",
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
