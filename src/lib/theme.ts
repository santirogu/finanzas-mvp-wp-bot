// La apariencia de la app: la del sistema (por defecto), clara u oscura. Se elige en Mi cuenta y se
// guarda en este navegador (localStorage), no en la cuenta: cada dispositivo puede tener la suya, y
// se aplica antes de pintar la página también donde no hay sesión (el login, las páginas públicas,
// que se sirven prearmadas). Los colores de cada modo están en src/app/globals.css: el oscuro se usa
// si <html data-theme="dark">, o si el sistema está en oscuro y no hay data-theme="light".

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = { system: "Sistema", light: "Claro", dark: "Oscuro" };

/** La clave en localStorage. Sin ella (o con otro valor), "Sistema". */
export const THEME_KEY = "tema";

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
    let theme = null;
    try { theme = localStorage.getItem(${JSON.stringify(THEME_KEY)}); } catch {}
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    else delete root.dataset.theme;
  };
  apply();
  addEventListener("storage", (event) => { if (event.key === ${JSON.stringify(THEME_KEY)}) apply(); });
})();`;

/** El evento con el que el selector avisa de un cambio en la misma pestaña ("storage" solo llega a las otras). */
export const THEME_EVENT = "cambio-de-tema";

/** El tema guardado en este navegador. */
export function readTheme(): Theme {
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

/** Guarda el tema en este navegador y lo aplica de inmediato. */
export function saveTheme(theme: Theme) {
  const root = document.documentElement;
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
