"use client";

import { createContext, type ReactNode, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import type { Texts } from "./texts";

// El idioma de la página para los componentes de cliente: lo pone el layout raíz (src/app/[lang]/layout.tsx),
// que lo lee del segmento. Solo viaja el idioma; cada componente trae sus textos (src/i18n/texts.ts).

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

/** El idioma de la página (fuera del layout, como en las pruebas, el de por defecto). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Esos textos, en el idioma de la página. */
export function useTexts<T>(texts: Texts<T>): T {
  return texts[useLocale()];
}
