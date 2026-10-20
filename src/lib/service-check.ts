// El resultado de probar la conexión con un servicio externo (/admin/bot → Conexiones): WhatsApp
// (src/modules/whatsapp/client.ts) y Claude (src/modules/bot/claude-extractor.ts). Sin dependencias.

/**
 * `error` es lo que respondió el servicio, como lo guarda el bot ("401 {…}") o el tipo de la
 * excepción (describeError): el admin lo ve legible (src/modules/admin/bot/connections.ts). Nunca
 * lleva el token ni la API key. `detail` es lo que identifica la conexión (el nombre del número o del
 * modelo), o null si el servicio no lo dio.
 */
export type ServiceCheck =
  | { status: "ok"; detail: string | null; warning?: ServiceWarning }
  | { status: "sin_configurar"; missing: string[] }
  | { status: "error"; error: string };

/**
 * Algo que avisar aunque la conexión funcione: la calidad baja del número en Meta o un modelo obsoleto.
 * Son datos: la frase la arma quien la muestra, en el idioma de la página (connectionView).
 */
export type ServiceWarning = { kind: "low_quality"; quality: string } | { kind: "deprecated_model"; since: string };

/** Cuánto se espera a cada servicio al probarlo (el admin está mirando la página). */
export const CHECK_TIMEOUT_MS = 8_000;
