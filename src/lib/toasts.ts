// Los avisos emergentes que se piden desde el servidor, después de una redirección: la URL solo lleva
// un código fijo (`?aviso=guardado`), nunca datos de la persona, y la app lo quita al mostrarlo. Cada
// código vale solo en las páginas adonde redirige su acción: un enlace con ?aviso= en otra no muestra
// nada (si no, cualquiera podría mandar uno que diga "Se eliminó la cuenta" en el Resumen).

import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

/** Verde lo que se guardó o se activó; rojo lo que se borró o se desactivó. */
export type ToastTone = "success" | "removal";

/** El parámetro de la URL con el código del aviso. */
export const TOAST_PARAM = "aviso";

export const URL_TOASTS = {
  // Después de editar un movimiento (updateTransactionAction).
  guardado: { tone: "success", message: { es: "Cambios guardados", en: "Changes saved" }, paths: ["/ingresos", "/egresos"] },
  // Después de eliminar una cuenta desde su detalle en el admin.
  "cuenta-eliminada": { tone: "removal", message: { es: "Se eliminó la cuenta", en: "The account was deleted" }, paths: ["/admin/usuarios"] },
  // Después de elegir el idioma en Configuración (saveLanguageAction): el aviso ya sale en el idioma nuevo.
  "idioma-guardado": { tone: "success", message: { es: "Idioma guardado", en: "Language saved" }, paths: ["/configuracion"] },
} as const satisfies Record<string, { tone: ToastTone; message: Record<Locale, string>; paths: readonly string[] }>;

export type UrlToastCode = keyof typeof URL_TOASTS;

/**
 * El aviso de un código de la URL en esa página, en su idioma; null si no es uno de URL_TOASTS o no es de
 * esa página.
 */
export function urlToast(code: unknown, pathname: string, locale: Locale = DEFAULT_LOCALE): { tone: ToastTone; message: string } | null {
  if (typeof code !== "string" || !Object.hasOwn(URL_TOASTS, code)) return null;
  const { tone, message, paths } = URL_TOASTS[code as UrlToastCode];
  return (paths as readonly string[]).includes(pathname) ? { tone, message: message[locale] } : null;
}

/** La misma dirección sin esos parámetros (para no volver a mostrar el aviso al recargar). */
export function withoutParams(pathname: string, search: string, names: string[]): string {
  const params = new URLSearchParams(search);
  for (const name of names) params.delete(name);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
