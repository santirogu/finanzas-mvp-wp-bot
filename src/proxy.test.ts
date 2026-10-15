import { NextRequest } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

// El proxy es solo la primera barrera (mira si existe la cookie, no si es válida): la sesión real
// se valida en src/lib/session.ts. Aquí se prueba que redirija a cada quien adonde corresponde.

const ORIGIN = "https://finanzas.test";
// En producción (https) Better Auth agrega el prefijo __Secure- al nombre de la cookie.
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

function visit(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${cookie}=token-de-prueba`);
  const response = proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));
  return getRedirectUrl(response) ?? "sigue";
}

describe("proxy · sin sesión", () => {
  it.each(["/", "/login", "/registro"])("deja entrar a %s", (path) => {
    expect(visit(path)).toBe("sigue");
  });

  it.each(["/privacidad", "/eliminar-datos", "/cuenta-eliminada"])("deja ver %s (página pública)", (path) => {
    expect(visit(path)).toBe("sigue");
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
    expect(visit(path, cookie)).toBe("sigue");
  });

  it.each(["/dashboard", "/ingresos", "/egresos", "/una-ruta-nueva"])("deja entrar a %s", (path) => {
    expect(visit(path, cookie)).toBe("sigue");
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
      "/_vercel/insights/script.js",
      "/_vercel/insights/view",
    ]) {
      expect(runsOn(url), url).toBe(false);
    }
  });

  it("no se salta páginas que solo empiezan como una ruta excluida", () => {
    for (const url of ["/apiario", "/api-docs", "/_next/staticos", "/_next/imagenes", "/favicon.icono", "/faviconXico", "/robots.txt.bak", "/robotsXtxt", "/_vercelito", "/_vercel"]) {
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

  it.each(SESSION_COOKIES)("con %s deja ver el login en vez de mandarlo al dashboard (sin círculo)", (cookie) => {
    expect(getRedirectUrl(visitExpired("/login?sesion=vencida", cookie)) ?? "sigue").toBe("sigue");
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
