import "server-only";
import { lang } from "next/root-params";
import { type Locale, localeOf } from "./locales";
import type { Texts } from "./texts";

// El idioma de la página que se está armando: el segmento [lang] de src/app (lo pone el proxy). Se puede
// leer desde cualquier componente de servidor, sin pasarlo de uno a otro (next/root-params).

export async function getLocale(): Promise<Locale> {
  return localeOf(await lang());
}

/** Esos textos, en el idioma de la página. */
export async function getTexts<T>(texts: Texts<T>): Promise<T> {
  return texts[await getLocale()];
}
