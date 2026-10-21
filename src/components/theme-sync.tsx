"use client";

import { useLayoutEffect } from "react";
import { applySavedTheme } from "@/lib/theme";

/**
 * Vuelve a poner el tema guardado cada vez que se monta el layout raíz. El script del <head> (THEME_SCRIPT)
 * solo corre al cargar la página; si el layout raíz cambia sin recargar (otro idioma, /es → /en: al
 * elegirlo en Mi cuenta o al entrar con una cuenta que tiene otro), React vuelve a montar <html> y le quita
 * data-theme, y la app quedaba con el tema del sistema aunque se hubiera elegido otro. Antes de pintar: sin
 * parpadeo.
 */
export function ThemeSync() {
  useLayoutEffect(applySavedTheme, []);
  return null;
}
