import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { botSetting, user, whatsappMessage } from "@/db/schema";
import { getRequestLocale } from "@/i18n/request";
import { texts } from "@/i18n/texts";
import { requireAdmin } from "@/lib/session";
import { recordEvent } from "@/modules/account/events";
import { monthlyBudgetReached, parseAiLimits, parseMonthlyTokenLimit, type AiLimits } from "@/modules/bot/limits";
import { BOT_SETTING_ID, DEFAULT_BOT_SETTINGS, getBotSettings } from "@/modules/bot/settings";
import { currentBudgetMonth, tokensUsedThisMonth } from "@/modules/bot/token-budget";
import { confirmAdminCode } from "../shared/confirm-code";
import { formatCount } from "./bot-filters";

// La configuración del bot desde /admin/bot: pausar o reanudar Claude, cambiar los topes por cuenta y
// el tope mensual de tokens.
// Como las acciones de Usuarios, cada cambio:
//  1. valida el rol (requireAdmin);
//  2. revisa que haya algo que cambiar y que los datos sirvan (si no, no gasta el código);
//  3. confirma el código de Google Authenticator (confirmAdminCode: límite de intentos, un solo uso);
//  4. guarda la fila única de bot_setting y lo registra en el historial con el admin (sin cuenta ni
//     número), en la misma transacción.
// El bot la lee en cada mensaje (src/modules/bot/settings.ts): el cambio aplica desde el siguiente. Los
// mensajes van en el idioma de quien hace el pedido (la cookie), como los de Usuarios.

export type BotSettingsView = {
  claudePaused: boolean;
  limits: AiLimits;
  monthlyTokenLimit: number | null;
  /** Tokens de Claude usados este mes (de todas las cuentas) y el día en que empieza el siguiente. */
  month: { used: number; reached: boolean; resetsOn: string };
  /** Tokens por llamada a Claude, en promedio (para elegir el tope); null sin llamadas todavía. */
  averageTokensPerCall: number | null;
  /** El último cambio, o null si nadie la ha cambiado (valen los de siempre). */
  updated: { at: Date; by: string | null } | null;
};

type Field = "code" | "perHour" | "perDay" | "monthlyLimit";
export type BotSettingResult = { ok: true; message: string } | { ok: false; error: string; field?: Field };

const fail = (error: string, field?: Field): BotSettingResult => ({ ok: false, error, ...(field && { field }) });

const TEXTS = texts(
  {
    alreadyPaused: "Claude ya está en pausa.",
    alreadyActive: "Claude ya está activo.",
    paused: "Claude quedó en pausa: el bot responde los comandos y pide registrar lo demás en la web.",
    resumed: "Claude volvió a funcionar: el bot entiende otra vez los mensajes escritos libremente.",
    sameLimits: "Los topes ya son esos: cambia alguno.",
    limits: (perHour: string, perDay: string) => `Los topes quedaron en ${perHour} por hora y ${perDay} por día, por cuenta.`,
    alreadyNoMonthly: "Ya no hay tope mensual.",
    sameMonthly: "El tope mensual ya es ese: cambia el número.",
    monthlyRemoved: "Se quitó el tope mensual de tokens.",
    monthly: (tokens: string) => `El tope mensual quedó en ${tokens} tokens: al llegar, el bot deja de usar Claude hasta el mes siguiente.`,
  },
  {
    en: {
      alreadyPaused: "Claude is already paused.",
      alreadyActive: "Claude is already on.",
      paused: "Claude is paused: the bot answers the commands and asks to add everything else on the web.",
      resumed: "Claude is working again: the bot understands freely written messages again.",
      sameLimits: "Those are already the limits: change one.",
      limits: (perHour, perDay) => `The limits are now ${perHour} per hour and ${perDay} per day, per account.`,
      alreadyNoMonthly: "There's already no monthly limit.",
      sameMonthly: "That's already the monthly limit: change the number.",
      monthlyRemoved: "The monthly token limit was removed.",
      monthly: (tokens) => `The monthly limit is now ${tokens} tokens: once it's reached, the bot stops using Claude until next month.`,
    },
  },
);

/** La configuración actual, con lo que va del mes y quién la cambió por última vez. */
export async function botSettingsForAdmin(now = new Date()): Promise<BotSettingsView> {
  await requireAdmin();
  const [[row], used, [average]] = await Promise.all([
    db
      .select({
        claudePaused: botSetting.claudePaused,
        perHour: botSetting.aiPerHour,
        perDay: botSetting.aiPerDay,
        monthlyTokenLimit: botSetting.monthlyTokenLimit,
        at: botSetting.updatedAt,
        by: user.name,
      })
      .from(botSetting)
      .leftJoin(user, eq(user.id, botSetting.updatedBy))
      .where(eq(botSetting.id, BOT_SETTING_ID)),
    tokensUsedThisMonth(now),
    db
      .select({
        tokens: sql<number | null>`round(avg(
          coalesce((${whatsappMessage.intent}->'usage'->>'inputTokens')::int, 0) +
          coalesce((${whatsappMessage.intent}->'usage'->>'outputTokens')::int, 0)
        ))`.mapWith((value) => (value === null ? null : Number(value))),
      })
      .from(whatsappMessage)
      .where(sql`${whatsappMessage.intent}->'usage' is not null`),
  ]);
  const settings = row
    ? { claudePaused: row.claudePaused, limits: { perHour: row.perHour, perDay: row.perDay }, monthlyTokenLimit: row.monthlyTokenLimit }
    : DEFAULT_BOT_SETTINGS;
  return {
    ...settings,
    month: { used, reached: monthlyBudgetReached(settings.monthlyTokenLimit, used), resetsOn: currentBudgetMonth(now).end },
    averageTokensPerCall: average.tokens,
    updated: row ? { at: row.at, by: row.by } : null,
  };
}

/** Pausa o reanuda Claude: en pausa, el texto libre recibe un aviso y los comandos siguen. */
export async function setClaudePaused({ paused, code }: { paused: boolean; code: string }, now = new Date()): Promise<BotSettingResult> {
  const admin = await requireAdmin();
  const t = TEXTS[await getRequestLocale()];
  const current = await getBotSettings();
  if (current.claudePaused === paused) return fail(paused ? t.alreadyPaused : t.alreadyActive);
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx
      .insert(botSetting)
      .values({ id: BOT_SETTING_ID, claudePaused: paused, aiPerHour: current.limits.perHour, aiPerDay: current.limits.perDay, updatedAt: now, updatedBy: admin.id })
      .onConflictDoUpdate({ target: botSetting.id, set: { claudePaused: paused, updatedAt: now, updatedBy: admin.id } });
    await recordEvent({ type: paused ? "bot_claude_paused" : "bot_claude_resumed", userId: null, adminId: admin.id }, tx);
  });
  return { ok: true, message: paused ? t.paused : t.resumed };
}

/** Cambia los topes de mensajes con Claude por cuenta (por hora y por día). */
export async function setAiLimits(
  { perHour, perDay, code }: { perHour: string; perDay: string; code: string },
  now = new Date(),
): Promise<BotSettingResult> {
  const admin = await requireAdmin();
  const locale = await getRequestLocale();
  const t = TEXTS[locale];
  const input = parseAiLimits({ perHour, perDay }, locale);
  if (!input.ok) return fail(input.error, input.field);
  const current = await getBotSettings();
  const { limits } = input;
  if (limits.perHour === current.limits.perHour && limits.perDay === current.limits.perDay) {
    return fail(t.sameLimits);
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
  return { ok: true, message: t.limits(formatCount(limits.perHour, locale), formatCount(limits.perDay, locale)) };
}

/** Pone, cambia o quita (vacío) el tope mensual de tokens de Claude, de todas las cuentas. */
export async function setMonthlyTokenLimit({ limit, code }: { limit: string; code: string }, now = new Date()): Promise<BotSettingResult> {
  const admin = await requireAdmin();
  const locale = await getRequestLocale();
  const t = TEXTS[locale];
  const input = parseMonthlyTokenLimit(limit, locale);
  if (!input.ok) return fail(input.error, "monthlyLimit");
  const current = await getBotSettings();
  if (input.limit === current.monthlyTokenLimit) {
    return fail(input.limit === null ? t.alreadyNoMonthly : t.sameMonthly);
  }
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx
      .insert(botSetting)
      .values({
        id: BOT_SETTING_ID,
        claudePaused: current.claudePaused,
        aiPerHour: current.limits.perHour,
        aiPerDay: current.limits.perDay,
        monthlyTokenLimit: input.limit,
        updatedAt: now,
        updatedBy: admin.id,
      })
      .onConflictDoUpdate({ target: botSetting.id, set: { monthlyTokenLimit: input.limit, updatedAt: now, updatedBy: admin.id } });
    await recordEvent(
      {
        type: "bot_monthly_limit_changed",
        userId: null,
        adminId: admin.id,
        details: { monthlyLimit: input.limit, previousMonthlyLimit: current.monthlyTokenLimit },
      },
      tx,
    );
  });
  return {
    ok: true,
    message: input.limit === null ? t.monthlyRemoved : t.monthly(formatCount(input.limit, locale)),
  };
}
