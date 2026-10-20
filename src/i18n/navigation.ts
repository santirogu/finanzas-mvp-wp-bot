import { usePathname } from "next/navigation";
import { withoutLocale } from "./locales";

/**
 * La ruta actual como la ve el navegador (/dashboard), sin el idioma que agrega el proxy por dentro. Úsala
 * en vez de usePathname: para marcar la pestaña activa o volver a la misma dirección.
 */
export function useAppPathname(): string {
  return withoutLocale(usePathname());
}
