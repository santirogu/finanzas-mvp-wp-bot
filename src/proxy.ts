import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { LOCALE_COOKIE, localeOf } from "./i18n/locales";
import { EXPIRED_SESSION_PARAM, SESSION_COOKIE_NAMES } from "./lib/expired-session";

const PUBLIC_ONLY = ["/", "/login", "/registro"];
// Páginas visibles con o sin sesión (Meta exige que la política de privacidad sea pública; a
// /cuenta-eliminada se llega justo después de borrar la cuenta).
export const ALWAYS_PUBLIC = ["/privacidad", "/eliminar-datos", "/cuenta-eliminada"];
// Páginas de la app con otra versión para quien no tiene sesión, en la misma dirección: con sesión, la de la app
// (/ayuda, con sus pestañas); sin sesión, la pública (/ayuda-publica, enlazada desde la portada, el login y el
// registro). La pública no tiene dirección propia: si alguien la pide, va a la de la app.
export const PUBLIC_VERSIONS: ReadonlyMap<string, string> = new Map([["/ayuda", "/ayuda-publica"]]);

/**
 * La página en el idioma de la cookie o, sin ella, en español: por dentro, /dashboard se arma como
 * /es/dashboard (src/app/[lang]/, src/i18n/locales.ts), y el navegador sigue viendo /dashboard. Con `page`, se
 * arma esa otra página en la misma dirección.
 */
function localized(request: NextRequest, page = request.nextUrl.pathname) {
  const url = request.nextUrl.clone();
  const locale = localeOf(request.cookies.get(LOCALE_COOKIE)?.value);
  url.pathname = `/${locale}${page === "/" ? "" : page}`;
  return NextResponse.rewrite(url);
}

// Chequeo optimista (solo mira si existe la cookie) para redirigir rápido.
// La validación real de la sesión ocurre en src/lib/session.ts.
export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;

  if (ALWAYS_PUBLIC.includes(pathname)) return localized(request);
  const publicVersion = PUBLIC_VERSIONS.get(pathname);
  if (publicVersion && !hasSession) return localized(request, publicVersion);
  const appVersion = [...PUBLIC_VERSIONS].find(([, version]) => version === pathname)?.[0];
  if (appVersion) return NextResponse.redirect(new URL(appVersion, request.url));
  // La sesión ya no sirve (la validó requireUser): se borra la cookie y se muestra el login, en vez
  // de mandarlo al dashboard por la cookie vieja (ver src/lib/expired-session.ts). Se borra en una redirección a
  // la misma dirección, no en la respuesta que arma la página: el login se arma en cada pedido (el aviso para
  // todos) y, en esa respuesta, Next repetía las cookies vacías y sin Max-Age=0 (no se borraban, y la sesión nueva
  // no servía). Sin ninguna cookie de sesión, se muestra el login: no hay círculo.
  if (pathname === "/login" && request.nextUrl.searchParams.get(EXPIRED_SESSION_PARAM.name) === EXPIRED_SESSION_PARAM.value) {
    if (!SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name))) return localized(request);
    const response = NextResponse.redirect(request.nextUrl);
    for (const name of SESSION_COOKIE_NAMES) {
      response.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: name.startsWith("__Secure-"),
      });
    }
    return response;
  }
  if (hasSession && PUBLIC_ONLY.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (!hasSession && !PUBLIC_ONLY.includes(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return localized(request);
}

export const config = {
  // Todo menos la API (cada ruta tiene su propia protección), los archivos estáticos (también los de
  // public/, que no tienen idioma), robots.txt y sitemap.xml (públicos, para los buscadores), los íconos,
  // el manifest y la imagen para compartir (src/app y public/marca/), y las rutas de Vercel (/_vercel/,
  // p. ej. la analítica). Cada exclusión termina en "/" o en el fin de la ruta: sin eso, "api" también
  // excluiría "/apiario".
  matcher: [
    "/((?!api(?:/|$)|_next/static/|_next/image(?:/|$)|_vercel/|marca/|favicon\\.ico$|icon\\.svg$|apple-icon\\.png$|opengraph-image\\.png$|manifest\\.webmanifest$|robots\\.txt$|sitemap\\.xml$|app-icon-1024\\.png$).*)",
  ],
};
