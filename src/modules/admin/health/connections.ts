import "server-only";
import { max } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import type { ServiceCheck } from "@/lib/service-check";
import { checkClaudeConnection } from "@/modules/bot/claude-extractor";
import { currentBotModel } from "@/modules/bot/settings";
import { checkWhatsAppConnection } from "@/modules/whatsapp/client";

// Probar los servicios del bot desde /admin/salud: el token de WhatsApp y la API key de Claude, con
// consultas gratis que no envían mensajes ni gastan créditos (cada servicio, en su módulo), y cuándo
// llegó el último mensaje al webhook (si Meta dejó de enviar, se nota ahí). Solo lee: no pide el
// código ni queda en el historial. El resultado nunca lleva el token ni la API key.

export type ConnectionReport = {
  checkedAt: Date;
  whatsapp: ServiceCheck;
  claude: ServiceCheck;
  /** El último mensaje que llegó al webhook, o null si nunca llegó ninguno. */
  lastMessageAt: Date | null;
};

export async function testConnections(): Promise<ConnectionReport> {
  await requireAdmin();
  const [whatsapp, claude, [last]] = await Promise.all([
    checkWhatsAppConnection(),
    // Con el modelo que eligió el admin en /admin/bot.
    currentBotModel().then(checkClaudeConnection),
    db.select({ at: max(whatsappMessage.receivedAt) }).from(whatsappMessage),
  ]);
  return { checkedAt: new Date(), whatsapp, claude, lastMessageAt: last.at };
}
