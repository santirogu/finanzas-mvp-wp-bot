import "server-only";
import { requireAdmin } from "@/lib/session";
import { collectBotAlerts, type BotAlert } from "@/modules/bot/alerts";

/** Las alertas del bot para el Inicio del admin y /admin/bot (vacío: todo en orden). */
export async function botAlerts(now = new Date()): Promise<BotAlert[]> {
  await requireAdmin();
  return collectBotAlerts(now);
}
