import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

describe("contentSecurityPolicy", () => {
  it("en producción solo permite recursos de la propia app y bloquea iframes, plugins y formularios externos", () => {
    expect(contentSecurityPolicy()).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  });

  it("en desarrollo agrega lo que necesitan React y el recargado en caliente", () => {
    const dev = contentSecurityPolicy({ dev: true });
    expect(dev).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(dev).toContain("connect-src 'self' ws:");
    expect(contentSecurityPolicy()).not.toMatch(/unsafe-eval|ws:/);
  });

  it("nunca permite scripts ni conexiones a otros dominios", () => {
    for (const dev of [false, true]) {
      const csp = contentSecurityPolicy({ dev });
      expect(csp).not.toMatch(/https?:|\*/);
    }
  });
});

describe("securityHeaders", () => {
  it("incluye las cabeceras recomendadas con sus valores", () => {
    expect(Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]))).toEqual({
      "Content-Security-Policy": contentSecurityPolicy(),
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
  });

  it("la CSP de desarrollo es la de desarrollo", () => {
    const csp = securityHeaders({ dev: true }).find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toBe(contentSecurityPolicy({ dev: true }));
  });
});

describe("next.config", () => {
  it("aplica las cabeceras a todas las rutas y no anuncia X-Powered-By", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([{ source: "/:path*", headers: securityHeaders({ dev: false }) }]);
  });
});
