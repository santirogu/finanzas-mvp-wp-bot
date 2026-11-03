import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { botSetting } from "@/db/schema";
import { envVar } from "@/lib/env";
import { AI_LIMITS, type AiLimits } from "./limits";
import { resolveBotModel } from "./models";

// La configuración del bot que cambia el admin en /admin/bot (tabla bot_setting): si Claude está en
// pausa, los topes por cuenta y el tope mensual de tokens. La lee el bot en cada mensaje que necesitaría a Claude (una consulta
// corta por la clave primaria). Las escrituras, con el código del admin y su registro en el
// historial, están en src/modules/admin/bot/bot-settings.ts.

export type BotSettings = {
  claudePaused: boolean;
  limits: AiLimits;
  /** Tokens de Claude al mes, de todas las cuentas; null: sin tope. */
  monthlyTokenLimit: number | null;
  /** El modelo que eligió el admin; null: el de BOT_MODEL o el de siempre (resolveBotModel). */
  model: string | null;
};

/** Hasta que el admin cambie algo no hay fila: Claude activo, los topes de AI_LIMITS y sin tope mensual. */
export const DEFAULT_BOT_SETTINGS: BotSettings = { claudePaused: false, limits: { ...AI_LIMITS }, monthlyTokenLimit: null, model: null };

/** La fila única de la configuración (id = 1). */
export const BOT_SETTING_ID = 1;

export async function getBotSettings(): Promise<BotSettings> {
  const [row] = await db
    .select({
      claudePaused: botSetting.claudePaused,
      perHour: botSetting.aiPerHour,
      perDay: botSetting.aiPerDay,
      monthlyTokenLimit: botSetting.monthlyTokenLimit,
      model: botSetting.model,
    })
    .from(botSetting)
    .where(eq(botSetting.id, BOT_SETTING_ID));
  if (!row) return DEFAULT_BOT_SETTINGS;
  return {
    claudePaused: row.claudePaused,
    limits: { perHour: row.perHour, perDay: row.perDay },
    monthlyTokenLimit: row.monthlyTokenLimit,
    model: row.model,
  };
}

/** El modelo que usa el bot ahora: el de la configuración, el de BOT_MODEL o el de siempre. */
export async function currentBotModel(): Promise<string> {
  return resolveBotModel((await getBotSettings()).model, envVar("BOT_MODEL"));
}
