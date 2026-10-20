import "server-only";
import { lang } from "next/root-params";
import { DICTIONARIES, type Dictionary } from "./dictionaries";
import { type Locale, localeOf } from "./locales";

// El idioma de la página que se está armando: el segmento [lang] de src/app (lo pone el proxy). Se puede
// leer desde cualquier componente de servidor, sin pasarlo de uno a otro (next/root-params).

export async function getLocale(): Promise<Locale> {
  return localeOf(await lang());
}

/** Los textos del idioma de la página. */
export async function getDictionary(): Promise<Dictionary> {
  return DICTIONARIES[await getLocale()];
}
