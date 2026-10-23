// La apariencia de la app: la del sistema (por defecto), clara u oscura. Se elige en Mi cuenta y se guarda en
// la cuenta (user.theme, para cada navegador donde inicie sesión: src/lib/auth.ts) y en este navegador, en la
// cookie `tema` (la lee el script del <head>, así que no es HttpOnly). Se aplica antes de pintar la página
// también donde no hay sesión (el login, las páginas públicas, que se sirven prearmadas). Antes se guardaba
// solo en localStorage: sin la cookie, todavía vale lo de ahí. Los colores de cada modo están en
// src/app/globals.css: el oscuro se usa si <html data-theme="dark">, o si el sistema está en oscuro y no hay
// data-theme="light".

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = { system: "Sistema", light: "Claro", dark: "Oscuro" };

/** La clave en localStorage y el nombre de la cookie. Sin ninguna (o con otro valor), "Sistema". */
export const THEME_KEY = "tema";

/** Cuánto dura la cookie: un año, como la del idioma. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** La apariencia de la cookie `tema` (de `document.cookie`), o null si no hay. */
export function themeFromCookies(cookies: string): Theme | null {
  const value = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${THEME_KEY}=`))
    ?.slice(THEME_KEY.length + 1);
  return isTheme(value) ? value : null;
}

/** La cookie `tema` para `document.cookie`: para todo el sitio, por un año y, con https, segura. */
export const themeCookie = (theme: Theme, secure: boolean) =>
  `${THEME_KEY}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;

/** Lo que haya guardado, como tema: cualquier otra cosa es "system". */
export function parseTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * El script en línea del <head> (src/app/[lang]/layout.tsx): pone el tema guardado en <html data-theme>
 * antes de pintar la página (sin parpadeo) y lo sigue si cambia en otra pestaña. Va como texto
 * porque corre antes de React; la CSP permite scripts en línea. Si el navegador no deja leer
 * localStorage (modo privado estricto), queda el del sistema.
 */
export const THEME_SCRIPT = `(() => {
  const apply = () => {
    const key = ${JSON.stringify(THEME_KEY)};
    let theme = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(key + "="))?.slice(key.length + 1) ?? null;
    if (theme === null) try { theme = localStorage.getItem(key); } catch {}
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    else delete root.dataset.theme;
  };
  apply();
  addEventListener("storage", (event) => { if (event.key === ${JSON.stringify(THEME_KEY)}) apply(); });
})();`;

/** El evento con el que el selector avisa de un cambio en la misma pestaña ("storage" solo llega a las otras). */
export const THEME_EVENT = "cambio-de-tema";

/** El tema guardado en este navegador: el de la cookie o, sin ella, el de localStorage. */
export function readTheme(): Theme {
  const fromCookie = themeFromCookies(document.cookie);
  if (fromCookie) return fromCookie;
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

/**
 * Pone el tema guardado en <html data-theme>, lo mismo que THEME_SCRIPT al cargar la página. Lo usa ThemeSync
 * (src/components/theme-sync.tsx) cuando el layout raíz se vuelve a montar sin recargar.
 */
export function applySavedTheme() {
  const theme = readTheme();
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/**
 * Guarda el tema en este navegador (la cookie y, para avisar a las otras pestañas, localStorage) y lo aplica de
 * inmediato. En la cuenta lo guarda aparte el selector de Mi cuenta (saveThemeAction).
 */
export function saveTheme(theme: Theme) {
  const root = document.documentElement;
  document.cookie = themeCookie(theme, location.protocol === "https:");
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Sin localStorage, se aplica igual en esta página (no se recuerda).
  }
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}
