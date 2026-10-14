import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_ONLY = ["/", "/login", "/registro"];

// Chequeo optimista (solo mira si existe la cookie) para redirigir rápido.
// La validación real de la sesión ocurre en src/lib/session.ts.
export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;

  if (hasSession && PUBLIC_ONLY.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (!hasSession && !PUBLIC_ONLY.includes(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
