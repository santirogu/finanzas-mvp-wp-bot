"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { setAiLimits, setClaudePaused, type BotSettingResult } from "@/modules/admin/bot/bot-settings";

// La configuración del bot desde /admin/bot. Cada acción valida el rol antes que nada; el código de
// Google Authenticator, los datos y el registro en el historial se resuelven en
// src/modules/admin/bot/bot-settings.ts.

export type BotSettingState = { error?: string; field?: "code" | "perHour" | "perDay"; message?: string };

const code = (formData: FormData) => String(formData.get("code") ?? "");

/** Con éxito, vuelve a dibujar la página (el estado y los topes nuevos) y avisa qué pasó. */
function settle(result: BotSettingResult): BotSettingState {
  if (!result.ok) return { error: result.error, field: result.field };
  refresh();
  return { message: result.message };
}

export async function pauseClaudeAction(_prev: BotSettingState, formData: FormData): Promise<BotSettingState> {
  await requireAdmin();
  return settle(await setClaudePaused({ paused: true, code: code(formData) }));
}

export async function resumeClaudeAction(_prev: BotSettingState, formData: FormData): Promise<BotSettingState> {
  await requireAdmin();
  return settle(await setClaudePaused({ paused: false, code: code(formData) }));
}

export async function changeAiLimitsAction(_prev: BotSettingState, formData: FormData): Promise<BotSettingState> {
  await requireAdmin();
  return settle(
    await setAiLimits({
      perHour: String(formData.get("perHour") ?? ""),
      perDay: String(formData.get("perDay") ?? ""),
      code: code(formData),
    }),
  );
}
