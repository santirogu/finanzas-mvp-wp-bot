// Los avisos emergentes que se piden desde el servidor, después de una redirección: la URL solo lleva
// un código fijo (`?aviso=guardado`), nunca datos de la persona, y la app lo quita al mostrarlo. Cada
// código vale solo en las páginas adonde redirige su acción: un enlace con ?aviso= en otra no muestra
// nada (si no, cualquiera podría mandar uno que diga "Se eliminó la cuenta" en el Resumen).

/** Verde lo que se guardó o se activó; rojo lo que se borró o se desactivó. */
export type ToastTone = "success" | "removal";

/** El parámetro de la URL con el código del aviso. */
export const TOAST_PARAM = "aviso";

export const URL_TOASTS = {
  // Después de editar un movimiento (updateTransactionAction).
  guardado: { tone: "success", message: "Cambios guardados", paths: ["/ingresos", "/egresos"] },
  // Después de eliminar una cuenta desde su detalle en el admin.
  "cuenta-eliminada": { tone: "removal", message: "Se eliminó la cuenta", paths: ["/admin/usuarios"] },
} as const satisfies Record<string, { tone: ToastTone; message: string; paths: readonly string[] }>;

export type UrlToastCode = keyof typeof URL_TOASTS;

/** El aviso de un código de la URL en esa página; null si no es uno de URL_TOASTS o no es de esa página. */
export function urlToast(code: unknown, pathname: string): { tone: ToastTone; message: string } | null {
  if (typeof code !== "string" || !Object.hasOwn(URL_TOASTS, code)) return null;
  const { tone, message, paths } = URL_TOASTS[code as UrlToastCode];
  return (paths as readonly string[]).includes(pathname) ? { tone, message } : null;
}

/** La misma dirección sin esos parámetros (para no volver a mostrar el aviso al recargar). */
export function withoutParams(pathname: string, search: string, names: string[]): string {
  const params = new URLSearchParams(search);
  for (const name of names) params.delete(name);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
