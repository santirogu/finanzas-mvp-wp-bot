import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, type Locale, localeOf } from "./locales";

/**
 * El idioma de quien hace el pedido en una Server Action o en una ruta (las descargas): ahí no hay
 * segmento [lang] (next/root-params no llega), así que sale de la misma cookie con la que el proxy armó
 * la página. Aparte de server.ts: así las acciones no cargan next/root-params, que solo existe al compilar
 * con Next (las pruebas de integración las importan).
 */
export async function getRequestLocale(): Promise<Locale> {
  return localeOf((await cookies()).get(LOCALE_COOKIE)?.value);
}
