import { getAppUrl } from "@/lib/app-url";
import { THEME_COOKIE_MAX_AGE } from "./theme";

/**
 * Cómo pone el servidor la cookie `tema` (al iniciar sesión, src/lib/auth.ts): igual que el navegador
 * (themeCookie en src/lib/theme.ts), sin HttpOnly, porque la lee el script del <head> para pintar la página
 * sin parpadeo; con https, segura.
 */
export function themeCookieOptions() {
  return {
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    httpOnly: false,
    sameSite: "lax" as const,
    secure: getAppUrl().startsWith("https://"),
  };
}
