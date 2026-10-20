// Los idiomas de la app (README → Idiomas). La dirección no lleva el idioma: el proxy (src/proxy.ts)
// manda cada página, por dentro, a src/app/[lang]/ según la cookie `idioma` (/dashboard se arma como
// /es/dashboard), y el navegador sigue viendo /dashboard. Así las páginas públicas se prearman una vez
// por idioma y el <html lang> sale del segmento (next/root-params), sin leer cookies al armarlas.

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Con qué formato de Intl se escriben los números y las fechas de cada idioma. */
export const INTL_LOCALES: Readonly<Record<Locale, string>> = { es: "es-CO", en: "en-US" };

/** El de quien no eligió otro (y el de la cookie con un valor que no es un idioma). */
export const DEFAULT_LOCALE: Locale = "es";

/** La cookie con el idioma elegido. */
export const LOCALE_COOKIE = "idioma";

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

/** El idioma de ese valor (el de la cookie), o el de por defecto. */
export const localeOf = (value: unknown): Locale => (isLocale(value) ? value : DEFAULT_LOCALE);

/**
 * La ruta como la ve el navegador, sin el idioma de adelante: "/es/dashboard" → "/dashboard", "/es" → "/".
 * En una página prearmada, el servidor y el navegador pueden ver una u otra (usePathname con la reescritura
 * del proxy): con esto, las dos dan lo mismo.
 */
export function withoutLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  return isLocale(first) ? `/${rest.join("/")}` : pathname;
}
