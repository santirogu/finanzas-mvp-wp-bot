import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInfo } from "./build-info";

const env = (values: Record<string, string>) => (name: string) => values[name];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildInfo", () => {
  it("el commit y la fecha del build, y el entorno y la región que pone Vercel", () => {
    expect(
      buildInfo({ commit: "a".repeat(40), builtAt: "2026-10-21T02:00:00.000Z", env: env({ VERCEL_ENV: "production", VERCEL_REGION: "iad1" }) }),
    ).toEqual({
      commit: "a".repeat(40),
      builtAt: new Date("2026-10-21T02:00:00.000Z"),
      environment: "production",
      region: "iad1",
      node: process.version,
    });
  });

  it("un build local: sin commit, sin región y el entorno según NODE_ENV", () => {
    expect(buildInfo({ commit: "", builtAt: "", env: env({}) })).toMatchObject({ commit: null, builtAt: null, region: null, environment: "development" });
    vi.stubEnv("NODE_ENV", "production");
    expect(buildInfo({ commit: "", env: env({}) }).environment).toBe("production");
  });

  it("una fecha que no se entiende queda vacía", () => {
    expect(buildInfo({ builtAt: "ayer", env: env({}) }).builtAt).toBeNull();
  });

  it("por defecto lee lo que fija next.config.ts (APP_COMMIT_SHA, APP_BUILT_AT) y las variables de Vercel", () => {
    vi.stubEnv("APP_COMMIT_SHA", "b".repeat(40));
    vi.stubEnv("APP_BUILT_AT", "2026-10-20T10:00:00.000Z");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_REGION", "gru1");
    expect(buildInfo()).toMatchObject({ commit: "b".repeat(40), builtAt: new Date("2026-10-20T10:00:00.000Z"), environment: "preview", region: "gru1" });
  });
});
