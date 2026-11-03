import { getAppUrl } from "@/lib/app-url";
import { LOCALE_COOKIE_MAX_AGE } from "./locales";

/**
 * Cómo se guarda la cookie del idioma (en Configuración y al iniciar sesión, src/lib/auth.ts): para todo el
 * sitio, por un año, solo para el servidor (el navegador no la lee: el idioma de la página sale del proxy)
 * y, con https, segura, como las cookies de la sesión.
 */
export function localeCookieOptions() {
  return {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getAppUrl().startsWith("https://"),
  };
}
