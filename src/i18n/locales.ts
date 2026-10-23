// Los idiomas de la app (README → Idiomas). La dirección no lleva el idioma: el proxy (src/proxy.ts)
// manda cada página, por dentro, a src/app/[lang]/ según la cookie `idioma` o, sin ella, en español (decisión
// del dueño: el idioma del navegador no cuenta), y el navegador sigue viendo /dashboard (se arma como
// /es/dashboard). Quien no tiene sesión lo cambia con el selector de la portada, el login y el registro. Así las
// páginas públicas se prearman una vez por idioma y el <html lang> sale del segmento (next/root-params),
// sin leer cookies al armarlas.

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Con qué formato de Intl se escriben los números y las fechas de cada idioma. */
export const INTL_LOCALES: Readonly<Record<Locale, string>> = { es: "es-CO", en: "en-US" };

/** El de quien no eligió otro, aunque su navegador esté en otro idioma (y el de una cookie con un valor que no es un idioma). */
export const DEFAULT_LOCALE: Locale = "es";

/** La cookie con el idioma elegido (en el selector sin sesión, en Mi cuenta o al iniciar sesión con una cuenta que lo eligió). */
export const LOCALE_COOKIE = "idioma";

/** Cuánto dura la cookie del idioma: un año (los navegadores aceptan hasta 400 días). */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Las páginas con el selector de idioma para quien no tiene sesión (src/components/language-switch.tsx): las
 * únicas a las que vuelve chooseLanguageAction, que nunca va a una dirección que mande el formulario.
 */
export const LANGUAGE_SWITCH_PAGES: readonly string[] = ["/", "/login", "/registro"];

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
