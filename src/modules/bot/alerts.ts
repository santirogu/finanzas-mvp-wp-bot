import "server-only";
import { and, count, desc, eq, gt, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { botAlertsFrom, STUCK_AFTER_MINUTES, type BotAlert } from "./alert-rules";
import { getBotSettings } from "./settings";
import { currentBudgetMonth, tokensUsedThisMonth } from "./token-budget";

// Las alertas del bot: lo que no anda y hay que arreglar (un token vencido, Claude sin créditos, el tope
// mensual, mensajes sin procesar). Salen de lo que ya guarda cada mensaje (whatsapp_message) y de la
// configuración del bot, sin tabla propia: se apagan solas cuando el problema se resuelve (un envío o una
// llamada a Claude que vuelve a funcionar). Qué alerta sale de qué está en alert-rules.ts. Las ve el admin en
// el Inicio, en /admin/bot y en Salud (src/modules/admin/bot/alerts.ts).

export * from "./alert-rules";

/** Cuántos envíos y llamadas recientes se miran para saber desde cuándo fallan. */
const RECENT = 50;

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
