"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { connectionView, type ConnectionView } from "@/modules/admin/bot/bot-filters";
import { setAiLimits, setClaudePaused, type BotSettingResult } from "@/modules/admin/bot/bot-settings";
import { testConnections } from "@/modules/admin/bot/connections";
import { formatDateTime, formatHour } from "@/modules/admin/shared/filters";

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

export type ConnectionsState = {
  whatsapp?: ConnectionView;
  claude?: ConnectionView;
  /** "16 de oct de 2026, 6:00 p. m.", o null si nunca llegó un mensaje al webhook. */
  lastMessage?: string | null;
  /** La hora de la prueba ("6:05 p. m."). */
  checkedAt?: string;
};

/** Prueba WhatsApp y Claude sin enviar nada ni gastar créditos: solo lee, no pide el código. */
export async function testConnectionsAction(): Promise<ConnectionsState> {
  await requireAdmin();
  const report = await testConnections();
  return {
    whatsapp: connectionView("whatsapp", report.whatsapp),
    claude: connectionView("claude", report.claude),
    lastMessage: report.lastMessageAt && formatDateTime(report.lastMessageAt),
    checkedAt: formatHour(report.checkedAt),
  };
}
