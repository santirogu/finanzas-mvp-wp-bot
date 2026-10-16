import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { botSetting, user } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { recordEvent } from "@/modules/account/events";
import { parseAiLimits, type AiLimits } from "@/modules/bot/limits";
import { BOT_SETTING_ID, DEFAULT_BOT_SETTINGS, getBotSettings } from "@/modules/bot/settings";
import { confirmAdminCode } from "../shared/confirm-code";
import { formatCount } from "./bot-filters";

// La configuración del bot desde /admin/bot: pausar o reanudar Claude y cambiar los topes por cuenta.
// Como las acciones de Usuarios, cada cambio:
//  1. valida el rol (requireAdmin);
//  2. revisa que haya algo que cambiar y que los datos sirvan (si no, no gasta el código);
//  3. confirma el código de Google Authenticator (confirmAdminCode: límite de intentos, un solo uso);
//  4. guarda la fila única de bot_setting y lo registra en el historial con el admin (sin cuenta ni
//     número), en la misma transacción.
// El bot la lee en cada mensaje (src/modules/bot/settings.ts): el cambio aplica desde el siguiente.

export type BotSettingsView = {
  claudePaused: boolean;
  limits: AiLimits;
  /** El último cambio, o null si nadie la ha cambiado (valen los de siempre). */
  updated: { at: Date; by: string | null } | null;
};

export type BotSettingResult = { ok: true; message: string } | { ok: false; error: string; field?: "code" | "perHour" | "perDay" };

const fail = (error: string, field?: "code" | "perHour" | "perDay"): BotSettingResult => ({ ok: false, error, ...(field && { field }) });

/** La configuración actual, con quién la cambió por última vez. */
export async function botSettingsForAdmin(): Promise<BotSettingsView> {
  await requireAdmin();
  const [row] = await db
    .select({
      claudePaused: botSetting.claudePaused,
      perHour: botSetting.aiPerHour,
      perDay: botSetting.aiPerDay,
      at: botSetting.updatedAt,
      by: user.name,
    })
    .from(botSetting)
    .leftJoin(user, eq(user.id, botSetting.updatedBy))
    .where(eq(botSetting.id, BOT_SETTING_ID));
  if (!row) return { ...DEFAULT_BOT_SETTINGS, updated: null };
  return { claudePaused: row.claudePaused, limits: { perHour: row.perHour, perDay: row.perDay }, updated: { at: row.at, by: row.by } };
}

/** Pausa o reanuda Claude: en pausa, el texto libre recibe un aviso y los comandos siguen. */
export async function setClaudePaused({ paused, code }: { paused: boolean; code: string }, now = new Date()): Promise<BotSettingResult> {
  const admin = await requireAdmin();
  const current = await getBotSettings();
  if (current.claudePaused === paused) return fail(paused ? "Claude ya está en pausa." : "Claude ya está activo.");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx
      .insert(botSetting)
      .values({ id: BOT_SETTING_ID, claudePaused: paused, aiPerHour: current.limits.perHour, aiPerDay: current.limits.perDay, updatedAt: now, updatedBy: admin.id })
      .onConflictDoUpdate({ target: botSetting.id, set: { claudePaused: paused, updatedAt: now, updatedBy: admin.id } });
    await recordEvent({ type: paused ? "bot_claude_paused" : "bot_claude_resumed", userId: null, adminId: admin.id }, tx);
  });
  return {
    ok: true,
    message: paused
      ? "Claude quedó en pausa: el bot responde los comandos y pide registrar lo demás en la web."
      : "Claude volvió a funcionar: el bot entiende otra vez los mensajes escritos libremente.",
  };
}

/** Cambia los topes de mensajes con Claude por cuenta (por hora y por día). */
export async function setAiLimits(
  { perHour, perDay, code }: { perHour: string; perDay: string; code: string },
  now = new Date(),
): Promise<BotSettingResult> {
  const admin = await requireAdmin();
  const input = parseAiLimits({ perHour, perDay });
  if (!input.ok) return fail(input.error, input.field);
  const current = await getBotSettings();
  const { limits } = input;
  if (limits.perHour === current.limits.perHour && limits.perDay === current.limits.perDay) {
    return fail("Los topes ya son esos: cambia alguno.");
  }
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx
      .insert(botSetting)
      .values({ id: BOT_SETTING_ID, claudePaused: current.claudePaused, aiPerHour: limits.perHour, aiPerDay: limits.perDay, updatedAt: now, updatedBy: admin.id })
      .onConflictDoUpdate({
        target: botSetting.id,
        set: { aiPerHour: limits.perHour, aiPerDay: limits.perDay, updatedAt: now, updatedBy: admin.id },
      });
    await recordEvent(
      { type: "bot_limits_changed", userId: null, adminId: admin.id, details: { limits, previousLimits: current.limits } },
      tx,
    );
  });
  return {
    ok: true,
    message: `Los topes quedaron en ${formatCount(limits.perHour)} por hora y ${formatCount(limits.perDay)} por día, por cuenta.`,
  };
}
