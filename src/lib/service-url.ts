import { envVar } from "./env";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Dirección de un servicio externo (WhatsApp, Claude). La variable de entorno solo puede
 * apuntarla a un servidor local: las pruebas E2E usan servidores falsos. Con cada pedido viaja un
 * token o una API key, así que una variable mal configurada nunca debe mandarlos a otro host.
 */
export function serviceUrl(variable: string, defaultUrl: string): string {
  const value = envVar(variable);
  if (!value) return defaultUrl;
  try {
    const url = new URL(value);
    if (LOCAL_HOSTS.has(url.hostname)) return value.replace(/\/+$/, "");
  } catch {
    // No es una URL: se ignora igual que un host no permitido.
  }
  console.warn(`[config] ${variable} ignorada: solo se permite un servidor local (localhost)`);
  return defaultUrl;
}
