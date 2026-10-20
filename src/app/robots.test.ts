import { afterEach, describe, expect, it, vi } from "vitest";
import robots, { PRIVATE_PATHS } from "./robots";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt", () => {
  it("deja indexar lo público, bloquea la parte privada y la API, y apunta al sitemap", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://finanzas.co");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/ingresos", "/egresos", "/simulador", "/api/"] },
      sitemap: "https://finanzas.co/sitemap.xml",
    });
    expect(PRIVATE_PATHS).toContain("/api/");
  });
});
