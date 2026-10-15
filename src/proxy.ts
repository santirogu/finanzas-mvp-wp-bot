import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { EXPIRED_SESSION_PARAM, SESSION_COOKIE_NAMES } from "./lib/expired-session";

const PUBLIC_ONLY = ["/", "/login", "/registro"];
// Páginas visibles con o sin sesión (Meta exige que la política de privacidad sea pública; a
// /cuenta-eliminada se llega justo después de borrar la cuenta).
const ALWAYS_PUBLIC = ["/privacidad", "/eliminar-datos", "/cuenta-eliminada"];

// Chequeo optimista (solo mira si existe la cookie) para redirigir rápido.
// La validación real de la sesión ocurre en src/lib/session.ts.
export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;

  if (ALWAYS_PUBLIC.includes(pathname)) return NextResponse.next();
  // La sesión ya no sirve (la validó requireUser): se borra la cookie y se muestra el login, en vez
  // de mandarlo al dashboard por la cookie vieja (ver src/lib/expired-session.ts).
  if (pathname === "/login" && request.nextUrl.searchParams.get(EXPIRED_SESSION_PARAM.name) === EXPIRED_SESSION_PARAM.value) {
    const response = NextResponse.next();
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
  return NextResponse.next();
}

export const config = {
  // Todo menos la API (cada ruta tiene su propia protección), los archivos estáticos,
  // robots.txt (público, para los buscadores) y las rutas de Vercel (/_vercel/, p. ej. la
  // analítica). Cada exclusión termina en "/" o en el fin de la ruta: sin eso, "api" también
  // excluiría "/apiario".
  matcher: ["/((?!api(?:/|$)|_next/static/|_next/image(?:/|$)|_vercel/|favicon\\.ico$|robots\\.txt$).*)"],
};
