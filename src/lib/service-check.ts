// El resultado de probar la conexión con un servicio externo (/admin/bot → Conexiones): WhatsApp
// (src/modules/whatsapp/client.ts) y Claude (src/modules/bot/claude-extractor.ts). Sin dependencias.

/**
 * `error` es lo que respondió el servicio, como lo guarda el bot ("401 {…}") o el tipo de la
 * excepción (describeError): el admin lo ve legible (src/modules/admin/bot/connections.ts). Nunca
 * lleva el token ni la API key.
 */
export type ServiceCheck =
  | { status: "ok"; detail: string; warning?: string }
  | { status: "sin_configurar"; missing: string[] }
  | { status: "error"; error: string };

/** Cuánto se espera a cada servicio al probarlo (el admin está mirando la página). */
export const CHECK_TIMEOUT_MS = 8_000;
