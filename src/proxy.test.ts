import { NextRequest } from "next/server";
import { getRedirectUrl, getRewrittenUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

// El proxy es solo la primera barrera (mira si existe la cookie, no si es válida): la sesión real
// se valida en src/lib/session.ts. Aquí se prueba que redirija a cada quien adonde corresponde y que
// arme cada página en su idioma (src/app/[lang]/), sin cambiar la dirección.

const ORIGIN = "https://finanzas.test";
// En producción (https) Better Auth agrega el prefijo __Secure- al nombre de la cookie.
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

/** Adónde lo manda (la dirección de la redirección) o, si sigue, qué página arma ("sigue a …"). */
function visit(path: string, cookie?: string, extra = "", acceptLanguage?: string) {
  const headers = new Headers(acceptLanguage ? { "accept-language": acceptLanguage } : {});
  const cookies = [cookie && `${cookie}=token-de-prueba`, extra].filter(Boolean).join("; ");
  if (cookies) headers.set("cookie", cookies);
  const response = proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));
  return getRedirectUrl(response) ?? `sigue a ${getRewrittenUrl(response)}`;
}

/** La página en español de esa dirección, como la arma el proxy. */
const inSpanish = (path: string) => `sigue a ${ORIGIN}/es${path === "/" ? "" : path}`;

describe("proxy · sin sesión", () => {
  it.each(["/", "/login", "/registro"])("deja entrar a %s", (path) => {
    expect(visit(path)).toBe(inSpanish(path));
  });

  it.each(["/privacidad", "/eliminar-datos", "/cuenta-eliminada"])("deja ver %s (página pública)", (path) => {
    expect(visit(path)).toBe(inSpanish(path));
  });

  it.each(["/dashboard", "/ingresos", "/egresos", "/cuenta", "/simulador", "/una-ruta-nueva", "/dashboard/algo"])(
    "manda %s al login",
    (path) => {
      expect(visit(path)).toBe(`${ORIGIN}/login`);
    },
  );

  it("una cookie con otro nombre no cuenta como sesión", () => {
    expect(visit("/dashboard", "otra-app.session_token")).toBe(`${ORIGIN}/login`);
  });
});

describe.each(SESSION_COOKIES)("proxy · con sesión (%s)", (cookie) => {
  it.each(["/", "/login", "/registro"])("manda %s al dashboard", (path) => {
    expect(visit(path, cookie)).toBe(`${ORIGIN}/dashboard`);
  });

  it.each(["/privacidad", "/eliminar-datos", "/cuenta-eliminada"])("deja ver %s", (path) => {
    expect(visit(path, cookie)).toBe(inSpanish(path));
  });

  it.each(["/dashboard", "/ingresos", "/egresos", "/una-ruta-nueva"])("deja entrar a %s", (path) => {
    expect(visit(path, cookie)).toBe(inSpanish(path));
  });
});

describe("proxy · idioma", () => {
  const cookie = SESSION_COOKIES[0];

  it("arma la página en el idioma de la cookie, con los parámetros de la dirección", () => {
    expect(visit("/ingresos?mes=2026-10", cookie, "idioma=en")).toBe(`sigue a ${ORIGIN}/en/ingresos?mes=2026-10`);
    expect(visit("/ingresos?mes=2026-10", cookie, "idioma=es")).toBe(`sigue a ${ORIGIN}/es/ingresos?mes=2026-10`);
    expect(visit("/", undefined, "idioma=en")).toBe(`sigue a ${ORIGIN}/en`);
    expect(visit("/login", undefined, "idioma=en")).toBe(`sigue a ${ORIGIN}/en/login`);
  });

  it("sin la cookie, o con un idioma que la app no tiene, en español", () => {
    expect(visit("/dashboard", cookie)).toBe(inSpanish("/dashboard"));
    for (const value of ["fr", "", "ES", "EN", "es-CO", "en-US"]) expect(visit("/dashboard", cookie, `idioma=${value}`), value).toBe(inSpanish("/dashboard"));
  });

  it("sin la cookie, en español aunque el navegador pida inglés (sin guardar nada); con la cookie, la cookie", () => {
    expect(visit("/", undefined, "", "en-US,en;q=0.9")).toBe(inSpanish("/"));
    expect(visit("/login", undefined, "", "en-US,en;q=0.9")).toBe(inSpanish("/login"));
    expect(visit("/dashboard", cookie, "", "en")).toBe(inSpanish("/dashboard"));
    expect(visit("/login", undefined, "idioma=en", "es-CO")).toBe(`sigue a ${ORIGIN}/en/login`);
    const response = proxy(new NextRequest(`${ORIGIN}/login`, { headers: { "accept-language": "en" } }));
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("una dirección que ya trae el idioma no es una página: se arma como otra cualquiera (y da 404)", () => {
    expect(visit("/es/dashboard", cookie)).toBe(inSpanish("/es/dashboard"));
  });
});

describe("proxy · matcher", () => {
  const runsOn = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it("corre en todas las páginas", () => {
    for (const url of ["/", "/login", "/dashboard", "/ingresos?mes=2026-10", "/privacidad"]) {
      expect(runsOn(url), url).toBe(true);
    }
  });

  it("no corre en la API (cada ruta tiene su propia protección) ni en archivos estáticos", () => {
    for (const url of [
      "/api/auth/get-session",
      "/api/whatsapp/webhook",
      "/api/health",
      "/_next/static/chunks/app.js",
      "/_next/image?url=x",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
      "/_vercel/insights/script.js",
      "/_vercel/insights/view",
      "/app-icon-1024.png",
      "/icon.svg",
      "/apple-icon.png",
      "/opengraph-image.png",
      "/manifest.webmanifest",
      "/marca/icono-512.png",
    ]) {
      expect(runsOn(url), url).toBe(false);
    }
  });

  it("no se salta páginas que solo empiezan como una ruta excluida", () => {
    for (const url of ["/apiario", "/api-docs", "/_next/staticos", "/_next/imagenes", "/favicon.icono", "/faviconXico", "/robots.txt.bak", "/robotsXtxt", "/sitemap.xml.bak", "/sitemapXxml", "/_vercelito", "/_vercel", "/app-icon-1024.pngx", "/app-icon-1024Xpng", "/icon.svgx", "/iconXsvg", "/apple-icon.pngs", "/opengraph-image.pngx", "/manifest.webmanifests", "/marcas", "/marca"]) {
      expect(runsOn(url), url).toBe(true);
    }
  });

  it("excluye también las rutas exactas", () => {
    for (const url of ["/api", "/api/", "/_next/image"]) {
      expect(runsOn(url), url).toBe(false);
    }
  });
});

describe("proxy · sesión vencida (cookie vieja)", () => {
  function visitExpired(path: string, cookie = "better-auth.session_token") {
    const headers = new Headers({ cookie: `${cookie}=token-viejo` });
    return proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));
  }

  it.each(SESSION_COOKIES)("con %s la borra en una redirección a la misma dirección, en vez de mandarlo al dashboard", (cookie) => {
    const response = visitExpired("/login?sesion=vencida", cookie);
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/login?sesion=vencida`);
    expect(response.headers.getSetCookie().some((c) => c.startsWith(`${cookie}=;`) && /Max-Age=0/i.test(c))).toBe(true);
  });

  it("ya sin la cookie, deja ver el login (sin círculo)", () => {
    const response = proxy(new NextRequest(`${ORIGIN}/login?sesion=vencida`));
    expect(getRedirectUrl(response)).toBeNull();
    expect(getRewrittenUrl(response)).toBe(`${ORIGIN}/es/login?sesion=vencida`);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("con solo otra cookie de sesión vieja (sin el token), también la borra", () => {
    const response = visitExpired("/login?sesion=vencida", "better-auth.session_data");
    expect(getRedirectUrl(response)).toBe(`${ORIGIN}/login?sesion=vencida`);
  });

  it("borra todas las cookies de sesión, con Secure en las de prefijo __Secure-", () => {
    const setCookies = visitExpired("/login?sesion=vencida").headers.getSetCookie();
    for (const name of ["session_token", "session_data", "dont_remember"]) {
      const plain = setCookies.find((c) => c.startsWith(`better-auth.${name}=`));
      const secure = setCookies.find((c) => c.startsWith(`__Secure-better-auth.${name}=`));
      expect(plain, name).toMatch(new RegExp(`^better-auth\\.${name}=;`));
      expect(secure, name).toMatch(new RegExp(`^__Secure-better-auth\\.${name}=;`));
      expect(plain, name).toMatch(/SameSite=lax/i);
      expect(plain, name).toMatch(/Max-Age=0/i);
      expect(plain, name).toMatch(/Path=\//i);
      expect(plain, name).toMatch(/HttpOnly/i);
      expect(plain, name).not.toMatch(/Secure/);
      expect(secure, name).toMatch(/Max-Age=0/i);
      expect(secure, name).toMatch(/; Secure/i);
    }
  });

  it.each(["/login?sesion=otra", "/login?vencida=sesion", "/login"])("en %s, con cookie, sigue mandando al dashboard", (path) => {
    expect(getRedirectUrl(visitExpired(path))).toBe(`${ORIGIN}/dashboard`);
    expect(visitExpired(path).headers.getSetCookie()).toEqual([]);
  });

  it("solo aplica al login: en otras páginas el parámetro no borra nada", () => {
    for (const path of ["/dashboard?sesion=vencida", "/registro?sesion=vencida"]) {
      expect(visitExpired(path).headers.getSetCookie(), path).toEqual([]);
    }
  });
});
