import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { AI_LIMITS, DAY_MS, HOUR_MS, aiQuotaExceeded, type AiLimits } from "./limits";

/**
 * Reserva una llamada a Claude para un mensaje de la cuenta, si le queda cupo (los topes de
 * /admin/bot, o AI_LIMITS de ./limits.ts si el admin no los cambió). La reserva marca el mensaje (ai_requested_at) en una transacción corta con un bloqueo
 * por cuenta: así una ráfaga de mensajes simultáneos no supera el tope. La llamada a Claude va después, fuera de la
 * transacción (no se retiene una conexión de la base mientras responde).
 */
export async function reserveAiCall(
  userId: string,
  messageId: string,
  limits: AiLimits = AI_LIMITS,
  now = new Date(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bot-ai:${userId}`}))`);
    // En texto ISO: dentro de una plantilla sql, Drizzle no convierte la fecha como en gt().
    const hourAgo = new Date(now.getTime() - HOUR_MS).toISOString();
    const [used] = await tx
      .select({
        lastHour: sql<number>`count(*) filter (where ${whatsappMessage.aiRequestedAt} > ${hourAgo})`.mapWith(Number),
        lastDay: sql<number>`count(*)`.mapWith(Number),
      })
      .from(whatsappMessage)
      .where(
        and(
          eq(whatsappMessage.userId, userId),
          gt(whatsappMessage.aiRequestedAt, new Date(now.getTime() - DAY_MS)),
        ),
      );
    if (aiQuotaExceeded(used, limits)) return false;
    await tx
      .update(whatsappMessage)
      .set({ aiRequestedAt: now, userId })
      .where(eq(whatsappMessage.id, messageId));
    return true;
  });
}

