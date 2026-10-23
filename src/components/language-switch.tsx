"use client";

import { chooseLanguageAction } from "@/i18n/actions";
import { useLocale, useTexts } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n/locales";
import { useAppPathname } from "@/i18n/navigation";
import { texts } from "@/i18n/texts";

// Cada idioma con su abreviatura a la vista y su nombre en ese idioma para el lector de pantalla (el nombre
// empieza con la abreviatura: así también lo encuentra quien lo dice en voz alta).
const SHORT: Record<Locale, string> = { es: "ES", en: "EN" };
const NAMES: Record<Locale, string> = { es: "Español", en: "English" };

const TEXTS = texts({ label: "Idioma" }, { en: { label: "Language" } });

/**
 * "ES · EN" para quien no tiene sesión (la portada, el login y el registro): guarda el idioma en este navegador
 * y vuelve a la misma página (chooseLanguageAction). Sin JavaScript también funciona: es un formulario.
 */
export function LanguageSwitch() {
  const locale = useLocale();
  const pathname = useAppPathname();
  const t = useTexts(TEXTS);
  return (
    <form action={chooseLanguageAction}>
      <input type="hidden" name="to" value={pathname} />
      <div role="group" aria-label={t.label} className="flex gap-0.5 rounded-lg border border-border p-0.5">
        {LOCALES.map((option) => (
          <button
            key={option}
            type="submit"
            name="locale"
            value={option}
            lang={option}
            aria-label={NAMES[option]}
            aria-pressed={option === locale}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-xs font-semibold text-muted transition hover:text-foreground aria-pressed:bg-brand aria-pressed:text-brand-foreground pointer-fine:min-h-8 pointer-fine:min-w-9"
          >
            {SHORT[option]}
          </button>
        ))}
      </div>
    </form>
  );
}
