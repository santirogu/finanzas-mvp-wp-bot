"use client";

import { useFormStatus } from "react-dom";
import { useLocale, useTexts } from "@/i18n/client";
import { LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { saveLanguageAction } from "@/modules/account/actions";

// Cada idioma con su nombre en ese idioma (así lo encuentra quien no entiende el otro) y con su `lang`,
// para que el lector de pantalla lo pronuncie bien.
const NAMES: Record<Locale, string> = { es: "Español", en: "English" };

const TEXTS = texts({ legend: "Idioma", saving: "Guardando…" }, { en: { legend: "Language", saving: "Saving…" } });

/** "Español · English": se guarda al elegirlo y Mi cuenta vuelve a cargar en ese idioma (saveLanguageAction). */
export function LanguagePicker() {
  const locale = useLocale();
  return (
    <form action={saveLanguageAction}>
      <Options current={locale} />
    </form>
  );
}

function Options({ current }: { current: Locale }) {
  const { pending } = useFormStatus();
  const t = useTexts(TEXTS);
  return (
    <fieldset disabled={pending} aria-busy={pending || undefined} className="disabled:opacity-60">
      <legend className="sr-only">{t.legend}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-control p-1">
        {LOCALES.map((option) => (
          <label
            key={option}
            lang={option}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-muted transition has-[:checked]:bg-brand has-[:checked]:text-brand-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 hover:text-foreground has-[:checked]:hover:text-brand-foreground pointer-fine:min-h-9"
          >
            <input
              type="radio"
              name="locale"
              value={option}
              defaultChecked={option === current}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="sr-only"
            />
            {NAMES[option]}
          </label>
        ))}
      </div>
      <p role="status" className="sr-only">
        {pending ? t.saving : ""}
      </p>
    </fieldset>
  );
}
