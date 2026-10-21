"use client";

import { useId, useSyncExternalStore } from "react";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { THEME_EVENT, THEME_KEY, THEME_LABELS, THEMES, readTheme, saveTheme } from "@/lib/theme";

const TEXTS = texts(
  { legend: "Apariencia", labels: THEME_LABELS },
  { en: { legend: "Appearance", labels: { system: "System", light: "Light", dark: "Dark" } } },
);

// El tema guardado en este navegador, como estado de React: cambia al elegir otro aquí o en otra
// pestaña. En el servidor (y antes de hidratar) es "Sistema".
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

/** "Sistema · Claro · Oscuro": la apariencia de la app en este dispositivo (src/lib/theme.ts). */
export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as const);
  const t = useTexts(TEXTS);
  // Un grupo de radios propio: fuera de un formulario, los que tienen el mismo `name` son un solo grupo en
  // todo el documento. Next deja montada (oculta) la página anterior, y al cambiar de idioma quedan dos Mi
  // cuenta (/es y /en): con un nombre fijo, el selector oculto desmarcaba el visible.
  const name = useId();

  return (
    <fieldset>
      <legend className="sr-only">{t.legend}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-control p-1">
        {THEMES.map((option) => (
          <label
            key={option}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-muted transition has-[:checked]:bg-brand has-[:checked]:text-brand-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 hover:text-foreground has-[:checked]:hover:text-brand-foreground pointer-fine:min-h-9"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={theme === option}
              onChange={() => saveTheme(option)}
              className="sr-only"
            />
            {t.labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
