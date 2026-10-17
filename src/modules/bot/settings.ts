import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { botSetting } from "@/db/schema";
import { AI_LIMITS, type AiLimits } from "./limits";

// La configuración del bot que cambia el admin en /admin/bot (tabla bot_setting): si Claude está en
// pausa y los topes por cuenta. La lee el bot en cada mensaje que necesitaría a Claude (una consulta
// corta por la clave primaria). Las escrituras, con el código del admin y su registro en el
// historial, están en src/modules/admin/bot/bot-settings.ts.

export type BotSettings = { claudePaused: boolean; limits: AiLimits };

/** Hasta que el admin cambie algo no hay fila: Claude activo y los topes de AI_LIMITS. */
export const DEFAULT_BOT_SETTINGS: BotSettings = { claudePaused: false, limits: { ...AI_LIMITS } };

/** La fila única de la configuración (id = 1). */
export const BOT_SETTING_ID = 1;

export async function getBotSettings(): Promise<BotSettings> {
  const [row] = await db
    .select({ claudePaused: botSetting.claudePaused, perHour: botSetting.aiPerHour, perDay: botSetting.aiPerDay })
    .from(botSetting)
    .where(eq(botSetting.id, BOT_SETTING_ID));
  if (!row) return DEFAULT_BOT_SETTINGS;
  return { claudePaused: row.claudePaused, limits: { perHour: row.perHour, perDay: row.perDay } };
}
