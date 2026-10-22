import type { ServiceCheck } from "@/lib/service-check";
import { isWarning, type BotAlert } from "@/modules/bot/alert-rules";

// La vigilancia de producción (/api/cron/vigilancia), que llama cada hora un workflow de GitHub Actions
// (.github/workflows/vigilancia.yml): qué cuenta como un problema. Sin base de datos: la ruta junta los datos.

/** Qué falla, sin detalles: el workflow corre en un repositorio público. */
export type WatchProblem = "app" | "whatsapp" | "claude" | "bot_alerts";

// Meta responde 10 o 200 cuando el token no tiene permiso para leer el número (whatsapp_business_management):
// la prueba no puede leerlo, pero los envíos pueden funcionar igual (connection-view.ts). No es un problema.
const WHATSAPP_READ_ONLY = /"code":\s*(10|200)\b/;

const failing = (check: ServiceCheck, ignore?: RegExp) =>
  check.status === "sin_configurar" || (check.status === "error" && !(ignore && ignore.test(check.error)));

/**
 * Los problemas, de lo más grave a lo menos: la app no está lista (lo mismo que /api/health), WhatsApp o
 * Claude no conectan, o el bot tiene alertas que son fallas (el tope mensual cerca es solo un aviso).
 */
export function watchProblems({
  healthOk,
  whatsapp,
  claude,
  botAlerts,
}: {
  healthOk: boolean;
  whatsapp: ServiceCheck;
  claude: ServiceCheck;
  botAlerts: readonly BotAlert[];
}): WatchProblem[] {
  const problems: WatchProblem[] = [];
  if (!healthOk) problems.push("app");
  if (failing(whatsapp, WHATSAPP_READ_ONLY)) problems.push("whatsapp");
  if (failing(claude)) problems.push("claude");
  if (botAlerts.some((alert) => !isWarning(alert))) problems.push("bot_alerts");
  return problems;
}
