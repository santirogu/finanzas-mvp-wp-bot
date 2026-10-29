import { readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_VERSIONS } from "@/proxy";
import robots, { PRIVATE_PATHS, PUBLIC_EXCEPTIONS } from "./robots";

// Fuera de un pedido, connection() no tiene a qué esperar.
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));

afterEach(() => vi.unstubAllEnvs());

/** Lo que haría un buscador (RFC 9309): gana la regla más larga que empiece como la ruta; si empatan, Allow. */
function allowed(route: string): boolean {
  const longest = (rules: string[]) => Math.max(-1, ...rules.filter((rule) => route.startsWith(rule)).map((rule) => rule.length));
  return longest(["/", ...PUBLIC_EXCEPTIONS]) >= longest(PRIVATE_PATHS);
}

/**
 * Las rutas de las páginas y rutas de src/app (sin los grupos entre paréntesis ni el idioma, que no va en la
 * dirección; [id] → un id cualquiera). [...rest] no es una página: es la 404 de lo que no existe.
 */
function routesIn(dir: string, base = ""): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "[...rest]") {
      const segment = entry.name === "[lang]" || /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name.replace(/^\[.*\]$/, "un-id")}`;
      routes.push(...routesIn(path.join(dir, entry.name), `${base}${segment}`));
    } else if (entry.name === "page.tsx" || entry.name === "route.ts") {
      routes.push(base || "/");
    }
  }
  return routes;
}

const APP = path.join(__dirname);
const appRoutes = routesIn(path.join(APP, "[lang]", "(app)"));
// Las páginas de la app con versión sin sesión (la Ayuda) son públicas: la versión sin sesión se ve en la dirección
// de la de la app (la suya, por dentro, no es una dirección).
const publicVersions = [...PUBLIC_VERSIONS.values()];
const privateRoutes = appRoutes.filter((route) => !PUBLIC_VERSIONS.has(route));
const publicRoutes = [
  ...routesIn(APP).filter((route) => !appRoutes.includes(route) && !route.startsWith("/api") && !publicVersions.includes(route)),
  ...PUBLIC_VERSIONS.keys(),
];

describe("robots.txt", () => {
  it("deja indexar lo público, bloquea la parte privada y la API, y apunta al sitemap", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://finanzas.co");
    expect(await robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: ["/", "/cuenta-eliminada"],
        disallow: ["/dashboard", "/ingresos", "/egresos", "/gastos-fijos", "/reportes", "/configuracion", "/movimientos/", "/cuenta", "/admin", "/simulador", "/api/"],
      },
      sitemap: "https://finanzas.co/sitemap.xml",
    });
  });

  it("bloquea toda página y ruta de la parte privada (una nueva falla aquí hasta que se agregue)", () => {
    expect(privateRoutes).toEqual(expect.arrayContaining(["/dashboard", "/gastos-fijos", "/reportes/pdf", "/movimientos/un-id/editar", "/admin/usuarios/un-id"]));
    for (const route of privateRoutes) expect(allowed(route), route).toBe(false);
    expect(allowed("/api/health")).toBe(false);
  });

  it("deja ver todas las páginas públicas (también /cuenta-eliminada, aunque empieza como /cuenta, y la Ayuda)", () => {
    expect([...publicRoutes].sort()).toEqual(["/", "/ayuda", "/cuenta-eliminada", "/eliminar-datos", "/login", "/privacidad", "/registro"]);
    for (const route of publicRoutes) expect(allowed(route), route).toBe(true);
  });
});
