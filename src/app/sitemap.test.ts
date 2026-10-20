import { NextRequest } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";
import { PRIVATE_PATHS } from "./robots";
import sitemap, { SITEMAP_PATHS } from "./sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("sitemap.xml", () => {
  it("lista las páginas públicas con la URL de la app", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://finanzas.co/");
    expect(sitemap()).toEqual([
      { url: "https://finanzas.co" },
      { url: "https://finanzas.co/registro" },
      { url: "https://finanzas.co/login" },
      { url: "https://finanzas.co/privacidad" },
      { url: "https://finanzas.co/eliminar-datos" },
    ]);
  });

  // Un buscador que siga el sitemap no tiene sesión: si una página lo manda al login (o está
  // prohibida en robots.txt), indexaría el login en su lugar.
  it.each(SITEMAP_PATHS)("%s se ve sin sesión y robots.txt no la prohíbe", (path) => {
    const response = proxy(new NextRequest(`https://finanzas.co${path}`));
    expect(getRedirectUrl(response)).toBeNull();
    expect(PRIVATE_PATHS.some((privatePath) => path.startsWith(privatePath))).toBe(false);
  });

  it("el proxy no lo manda al login (como robots.txt)", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/sitemap.xml" })).toBe(false);
  });
});
