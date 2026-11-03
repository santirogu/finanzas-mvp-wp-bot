// Los modelos de Claude que el admin puede elegir para el bot (/admin/bot → Configuración), con lo que
// acertó cada uno en `pnpm bot:eval` (src/modules/bot/eval/cases.ts). Una lista cerrada: un id mal escrito
// dejaría al bot sin entender nada. Para sumar un modelo: su precio en pricing.ts, medirlo con
// `pnpm bot:eval --model <id>` (cuesta créditos) y anotar el resultado aquí.

/** Cuándo se midió cada modelo con bot:eval (YYYY-MM-DD). */
export const BOT_MODELS_EVALUATED_ON = "2026-10-21";

export const BOT_MODELS = [
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", eval: { passed: 58, total: 58 } },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", eval: { passed: 57, total: 58 } },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", eval: { passed: 57, total: 58 } },
] as const;

export type BotModel = (typeof BOT_MODELS)[number];

/** El de siempre: el más barato y el que más acertó. */
export const DEFAULT_BOT_MODEL = "claude-haiku-5-5";

/** ¿Es uno de la lista? */
export const isBotModel = (id: unknown): id is BotModel["id"] => BOT_MODELS.some((model) => model.id === id);

/**
 * El modelo que usa el bot: el que eligió el admin; si no eligió ninguno, BOT_MODEL del entorno (para
 * comparar en local) o el de siempre.
 */
export const resolveBotModel = (chosen: string | null, fromEnv: string | undefined) => chosen ?? (fromEnv || DEFAULT_BOT_MODEL);

/** El nombre para mostrar ("Claude Haiku 5.5"), o el id si no está en la lista (uno de BOT_MODEL). */
export const botModelName = (id: string) => BOT_MODELS.find((model) => model.id === id)?.name ?? id;
