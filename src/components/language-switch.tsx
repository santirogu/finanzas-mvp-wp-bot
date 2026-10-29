"use client";

import { chooseLanguageAction } from "@/i18n/actions";
import { useLocale, useTexts } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n/locales";
import { useAppPathname } from "@/i18n/navigation";
import { texts } from "@/i18n/texts";

// Cada idioma con su abreviatura a la vista y, para el lector de pantalla, también su nombre en ese idioma: el
// nombre del botón es "ES Español" (empieza con lo que se ve, WCAG 2.5.3: así lo encuentra también quien lo dice
// en voz alta).
const SHORT: Record<Locale, string> = { es: "ES", en: "EN" };
const NAMES: Record<Locale, string> = { es: "Español", en: "English" };

const TEXTS = texts({ label: "Idioma" }, { en: { label: "Language" } });

/**
 * "ES · EN" para quien no tiene sesión (la portada, el login, el registro y la Ayuda): guarda el idioma en este
 * navegador y vuelve a la misma página (chooseLanguageAction). Sin JavaScript también funciona: es un formulario.
 * `to`: adónde vuelve, si la dirección no es la de la página (la Ayuda pública se arma por dentro con otra).
 */
export function LanguageSwitch({ to }: { to?: string }) {
  const locale = useLocale();
  const pathname = useAppPathname();
  const t = useTexts(TEXTS);
  return (
    <form action={chooseLanguageAction}>
      <input type="hidden" name="to" value={to ?? pathname} />
      <div role="group" aria-label={t.label} className="flex gap-0.5 rounded-lg border border-border p-0.5">
        {LOCALES.map((option) => (
          <button
            key={option}
            type="submit"
            name="locale"
            value={option}
            lang={option}
            aria-label={`${SHORT[option]} ${NAMES[option]}`}
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
