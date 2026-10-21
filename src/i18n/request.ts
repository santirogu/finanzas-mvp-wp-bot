import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, type Locale, requestLocaleOf } from "./locales";

/**
 * El idioma de quien hace el pedido en una Server Action o en una ruta (las descargas): ahí no hay
 * segmento [lang] (next/root-params no llega), así que sale de lo mismo con lo que el proxy armó la página:
 * la cookie o, sin ella, el idioma del navegador. Aparte de server.ts: así las acciones no cargan
 * next/root-params, que solo existe al compilar con Next (las pruebas de integración las importan).
 */
export async function getRequestLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return requestLocaleOf(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));
}
