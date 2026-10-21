// Los idiomas de la app (README → Idiomas). La dirección no lleva el idioma: el proxy (src/proxy.ts)
// manda cada página, por dentro, a src/app/[lang]/ según la cookie `idioma` o, sin ella, el idioma del
// navegador (/dashboard se arma como /es/dashboard), y el navegador sigue viendo /dashboard. Así las
// páginas públicas se prearman una vez por idioma y el <html lang> sale del segmento (next/root-params),
// sin leer cookies al armarlas.

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Con qué formato de Intl se escriben los números y las fechas de cada idioma. */
export const INTL_LOCALES: Readonly<Record<Locale, string>> = { es: "es-CO", en: "en-US" };

/** El de quien no eligió otro (y el de la cookie con un valor que no es un idioma). */
export const DEFAULT_LOCALE: Locale = "es";

/** La cookie con el idioma elegido (en Mi cuenta, o al iniciar sesión con una cuenta que lo eligió). */
export const LOCALE_COOKIE = "idioma";

/** Cuánto dura la cookie del idioma: un año (los navegadores aceptan hasta 400 días). */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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

/**
 * El idioma que pide el navegador (la cabecera Accept-Language), para quien no eligió uno: el primero de
 * la app en su orden de preferencia (q), o el de por defecto. "en-US,en;q=0.9" → "en";
 * "fr-FR,fr;q=0.9,en;q=0.8" → "en"; "pt-BR" → "es". Nada se guarda: sin la cookie, se vuelve a mirar en
 * cada pedido.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    // Una cabecera normal tiene unos pocos idiomas: más allá de esto, se ignora.
    .slice(0, 500)
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.split(";").map((piece) => piece.trim());
      const q = params.find((param) => param.startsWith("q="));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { language: tag.toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return ranked.map((entry) => entry.language).find(isLocale) ?? DEFAULT_LOCALE;
}

/** El idioma de un pedido: el de la cookie, si eligió uno; si no, el de su navegador. */
export const requestLocaleOf = (cookie: string | undefined, acceptLanguage: string | null | undefined): Locale =>
  isLocale(cookie) ? cookie : negotiateLocale(acceptLanguage);
