"use server";

import { getRequestLocale } from "@/i18n/request";
import { requireAdmin } from "@/lib/session";
import { connectionView, type ConnectionView } from "@/modules/admin/health/connection-view";
import { testConnections } from "@/modules/admin/health/connections";
import { formatDateTime, formatHour } from "@/modules/admin/shared/filters";

// Lo que se hace desde /admin/salud: por ahora, probar las conexiones del bot. Solo lee.

export type ConnectionsState = {
  whatsapp?: ConnectionView;
  claude?: ConnectionView;
  /** "16 de oct. de 2026, 6:00 p. m.", o null si nunca llegó un mensaje al webhook. */
  lastMessage?: string | null;
  /** La hora de la prueba ("6:05 p. m."). */
  checkedAt?: string;
};

/** Prueba WhatsApp y Claude sin enviar nada ni gastar créditos: solo lee, no pide el código. En el idioma de la página. */
export async function testConnectionsAction(): Promise<ConnectionsState> {
  await requireAdmin();
  const locale = await getRequestLocale();
  const report = await testConnections();
  return {
    whatsapp: connectionView("whatsapp", report.whatsapp, locale),
    claude: connectionView("claude", report.claude, locale),
    lastMessage: report.lastMessageAt && formatDateTime(report.lastMessageAt, locale),
    checkedAt: formatHour(report.checkedAt, locale),
  };
}
