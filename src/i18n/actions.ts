"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { localeCookieOptions } from "./cookie";
import { isLocale, LANGUAGE_SWITCH_PAGES, LOCALE_COOKIE } from "./locales";

/**
 * El selector de idioma de quien no tiene sesión (la portada, el login y el registro): guarda la cookie del
 * idioma en este navegador y vuelve a la misma página (`to`), ya en ese idioma. No toca ninguna cuenta: con
 * sesión, el idioma se elige en Mi cuenta. Si `to` no es una de esas páginas, vuelve a la portada.
 */
export async function chooseLanguageAction(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  const to = formData.get("to");
  if (isLocale(locale)) (await cookies()).set(LOCALE_COOKIE, locale, localeCookieOptions());
  redirect(LANGUAGE_SWITCH_PAGES.find((page) => page === to) ?? "/");
}
