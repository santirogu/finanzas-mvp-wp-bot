import "server-only";
import { and, count, desc, eq, gt, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { monthlyBudgetReached } from "./limits";
import { getBotSettings } from "./settings";
import { currentBudgetMonth, tokensUsedThisMonth } from "./token-budget";

// Las alertas del bot: lo que no anda y hay que arreglar (un token vencido, Claude sin créditos, el tope
// mensual, mensajes sin procesar). Salen de lo que ya guarda cada mensaje (whatsapp_message) y de la
// configuración del bot, sin tabla propia: se apagan solas cuando el problema se resuelve (un envío o una
// llamada a Claude que vuelve a funcionar). Las ve el admin en el Inicio, en /admin/bot y en Salud
// (src/modules/admin/bot/alerts.ts).

/** Cuántos envíos o llamadas a Claude seguidos tienen que fallar, por una causa que puede ser pasajera, para alertar. */
export const FAILING_IN_A_ROW = 3;
/** Desde qué parte del tope mensual de tokens se avisa antes de llegar. */
export const NEAR_LIMIT_SHARE = 0.8;
/** Un mensaje que sigue sin procesar después de estos minutos se quedó a mitad (el bot responde en segundos). */
export const STUCK_AFTER_MINUTES = 10;
/** Cuántos envíos y llamadas recientes se miran para saber desde cuándo fallan. */
const RECENT = 50;

export type BotAlert =
  /** Meta rechaza el token al enviar (401 o código 190): el bot no puede responder. */
  | { kind: "whatsapp_token"; since: Date; unsent: number }
  /** Los últimos envíos fallaron por otra causa (Meta no responde, un permiso, una caída). */
  | { kind: "whatsapp_send"; since: Date; unsent: number }
  | { kind: "claude_key" | "claude_model" | "claude_credits" | "claude_config"; since: Date }
  /** Las últimas llamadas a Claude fallaron por una causa que puede ser pasajera (sobrecarga, red). */
  | { kind: "claude_failing"; since: Date; failures: number }
  | { kind: "monthly_limit"; resetsOn: string }
  /** `share`: la parte del tope ya usada (0,8 a 1). */
  | { kind: "monthly_limit_near"; share: number; resetsOn: string }
  | { kind: "stuck_messages"; count: number };

export type BotAlertKind = BotAlert["kind"];

/** El tope mensual es una alerta de aviso: Claude sigue andando (o se pausó solo, como se configuró). */
export const isWarning = (alert: BotAlert) => alert.kind === "monthly_limit_near";

// Los errores de Meta que dependen de quién recibe y no del bot: número que no está en la lista de prueba
// (131030), que no se puede entregar (131026) o fuera de la ventana de 24 horas (131047). No son una alerta.
const RECIPIENT_CODES = new Set(["131026", "131030", "131047"]);

export type SendFailureCause = "token" | "recipient" | "other";

/** Por qué falló un envío, del texto que guarda el bot ("envío: 401 {…}" o "envío: TimeoutError (23)"). */
export function sendFailureCause(error: string): SendFailureCause {
  const sent = error.slice(error.indexOf("envío: ") + "envío: ".length);
  const code = sent.match(/"code":\s*(\d+)/)?.[1];
  if (sent.startsWith("401 ") || code === "190") return "token";
  if (code && RECIPIENT_CODES.has(code)) return "recipient";
  return "other";
}

export type ClaudeFailureCause = "key" | "model" | "credits" | "config" | "transient" | "content";

/**
 * Por qué falló una llamada a Claude, del `reason` que guarda el bot ("api_error: 401 {…}", "not_configured").
 * Una negativa o una salida inválida dependen del mensaje ("content"): no son una alerta.
 */
export function claudeFailureCause(error: string): ClaudeFailureCause {
  if (error.startsWith("not_configured")) return "config";
  if (!error.startsWith("api_error")) return "content";
  if (/credit balance/i.test(error)) return "credits";
  const status = error.match(/^api_error: (\d{3}) /)?.[1];
  if (status === "401") return "key";
  if (status === "404") return "model";
  return "transient";
}

/** Un envío reciente, del más nuevo al más viejo: `error` solo si falló. */
export type RecentSend = { at: Date; error: string | null };
/** Una llamada reciente a Claude, de la más nueva a la más vieja: `error` solo si falló. */
export type RecentClaudeCall = { at: Date; error: string | null };

/** Los primeros de la lista que cumplen `failed`, sin contar los que `skip` deja de lado. */
function leadingFailures<T extends { error: string | null }>(rows: readonly T[], skip: (row: T) => boolean): T[] {
  const run: T[] = [];
  for (const row of rows) {
    if (row.error !== null && skip(row)) continue;
    if (row.error === null) break;
    run.push(row);
  }
  return run;
}

/** Las alertas, de lo más grave a lo menos, a partir de lo reciente. Sin base: se prueba sola. */
export function botAlertsFrom({
  sends,
  claudeCalls,
  budget,
  stuck,
}: {
  sends: readonly RecentSend[];
  claudeCalls: readonly RecentClaudeCall[];
  budget: { limit: number | null; used: number; resetsOn: string };
  stuck: number;
}): BotAlert[] {
  const alerts: BotAlert[] = [];

  const failedSends = leadingFailures(sends, (row) => sendFailureCause(row.error!) === "recipient");
  if (failedSends.length > 0) {
    const since = failedSends.at(-1)!.at;
    if (sendFailureCause(failedSends[0].error!) === "token") alerts.push({ kind: "whatsapp_token", since, unsent: failedSends.length });
    else if (failedSends.length >= FAILING_IN_A_ROW) alerts.push({ kind: "whatsapp_send", since, unsent: failedSends.length });
  }

  const failedCalls = leadingFailures(claudeCalls, (row) => claudeFailureCause(row.error!) === "content");
  if (failedCalls.length > 0) {
    const since = failedCalls.at(-1)!.at;
    const cause = claudeFailureCause(failedCalls[0].error!);
    if (cause !== "transient") alerts.push({ kind: `claude_${cause as "key" | "model" | "credits" | "config"}`, since });
    else if (failedCalls.length >= FAILING_IN_A_ROW) alerts.push({ kind: "claude_failing", since, failures: failedCalls.length });
  }

  if (budget.limit !== null) {
    if (monthlyBudgetReached(budget.limit, budget.used)) alerts.push({ kind: "monthly_limit", resetsOn: budget.resetsOn });
    else if (budget.used >= budget.limit * NEAR_LIMIT_SHARE) {
      alerts.push({ kind: "monthly_limit_near", share: budget.used / budget.limit, resetsOn: budget.resetsOn });
    }
  }

  if (stuck > 0) alerts.push({ kind: "stuck_messages", count: stuck });
  return alerts;
}

/**
 * Las alertas de ahora, con lo que guarda la base. Sin sesión: la usan las páginas del admin (que antes
 * piden requireAdmin, en src/modules/admin/bot/alerts.ts) y la vigilancia programada.
 */
export async function collectBotAlerts(now = new Date()): Promise<BotAlert[]> {
  // Un envío es todo mensaje ya procesado (siempre se responde); falló si su error lo dice ("envío: …") y no
  // se reenvió después (un reenvío que sale deja el mensaje "processed").
  const sendFailed = sql<boolean>`${whatsappMessage.status} = 'failed' and ${whatsappMessage.error} like '%envío:%'`;
  const [sends, claudeCalls, settings, used, [{ stuck }]] = await Promise.all([
    db
      .select({ at: whatsappMessage.receivedAt, failed: sendFailed, error: whatsappMessage.error })
      .from(whatsappMessage)
      .where(ne(whatsappMessage.status, "received"))
      .orderBy(desc(whatsappMessage.receivedAt))
      .limit(RECENT),
    // Las llamadas a Claude: las que reservaron cupo. Falló si su intención fue un error de Claude.
    db
      .select({
        at: whatsappMessage.aiRequestedAt,
        failed: sql<boolean>`coalesce(${whatsappMessage.intent}->>'kind', '') = 'error'`,
        error: whatsappMessage.error,
      })
      .from(whatsappMessage)
      .where(isNotNull(whatsappMessage.aiRequestedAt))
      .orderBy(desc(whatsappMessage.aiRequestedAt))
      .limit(RECENT),
    getBotSettings(),
    tokensUsedThisMonth(now),
    db
      .select({ stuck: count() })
      .from(whatsappMessage)
      .where(
        and(
          eq(whatsappMessage.status, "received"),
          gt(whatsappMessage.receivedAt, new Date(now.getTime() - 24 * 3_600_000)),
          lt(whatsappMessage.receivedAt, new Date(now.getTime() - STUCK_AFTER_MINUTES * 60_000)),
        ),
      ),
  ]);
  return botAlertsFrom({
    sends: sends.map((row) => ({ at: row.at, error: row.failed ? (row.error ?? "") : null })),
    claudeCalls: claudeCalls.map((row) => ({ at: row.at!, error: row.failed ? (row.error ?? "") : null })),
    budget: { limit: settings.monthlyTokenLimit, used, resetsOn: currentBudgetMonth(now).end },
    stuck,
  });
}
