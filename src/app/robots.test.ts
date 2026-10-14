import { describe, expect, it } from "vitest";
import robots, { PRIVATE_PATHS } from "./robots";

describe("robots.txt", () => {
  it("deja indexar lo público y bloquea la parte privada y la API", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/ingresos", "/egresos", "/simulador", "/api/"] },
    });
    expect(PRIVATE_PATHS).toContain("/api/");
  });
});
