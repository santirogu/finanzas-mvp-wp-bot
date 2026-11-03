"use client";

import { useLayoutEffect } from "react";
import { useAppPathname } from "@/i18n/navigation";
import { applySavedTheme } from "@/lib/theme";

/**
 * Vuelve a poner el tema guardado cada vez que se monta el layout raíz y en cada cambio de página. El script
 * del <head> (THEME_SCRIPT) solo corre al cargar la página, y hay dos casos sin recarga:
 * - el layout raíz cambia (otro idioma, /es → /en: al elegirlo en Configuración o al entrar con una cuenta que
 *   tiene otro): React vuelve a montar <html> y le quita data-theme;
 * - al iniciar sesión, la cuenta le pone a este navegador la cookie `tema` (src/lib/auth.ts) y el login pasa
 *   al Resumen sin recargar.
 * Antes de pintar: sin parpadeo.
 */
export function ThemeSync() {
  const pathname = useAppPathname();
  useLayoutEffect(applySavedTheme, [pathname]);
  return null;
}
