import "server-only";
import { and, count, desc, eq, gt, isNotNull, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { recordEvent } from "@/modules/account/events";
import { sendWhatsAppText, type Sender } from "@/modules/whatsapp/client";
import { confirmAdminCode } from "../shared/confirm-code";
import { MAX_RESENDS, RESEND_WINDOW_HOURS } from "./bot-filters";
import type { BotSettingResult } from "./bot-settings";

// Reenviar desde /admin/bot las respuestas del bot que no salieron por WhatsApp (por ejemplo, un
// token vencido o un número fuera de la lista de Meta, ya arreglados). Se reenvía la respuesta que
// guardó el bot, tal cual: no se vuelve a interpretar nada ni se registran movimientos otra vez. El
// admin no la ve: solo cuántas son. Pide el código y queda en el historial (sin cuenta ni número).

/**
 * Las que se pueden reenviar: fallaron al enviar (no al entender el mensaje), tienen una respuesta de
 * verdad (no un aviso de error) y llegaron hace menos de RESEND_WINDOW_HOURS.
 */
const resendable = (now: Date) =>
  and(
    eq(whatsappMessage.status, "failed"),
    like(whatsappMessage.error, "%envío:%"),
    isNotNull(whatsappMessage.reply),
    sql`coalesce(${whatsappMessage.intent}->>'kind', '') <> 'error'`,
    gt(whatsappMessage.receivedAt, new Date(now.getTime() - RESEND_WINDOW_HOURS * 3_600_000)),
  );

/** Cuántas respuestas se pueden reenviar ahora. */
export async function pendingResends(now = new Date()): Promise<number> {
  await requireAdmin();
  const [row] = await db.select({ n: count() }).from(whatsappMessage).where(resendable(now));
  return row.n;
}

/**
 * Reenvía las que se pueden (las más recientes primero, hasta MAX_RESENDS). Cada una se marca antes
 * de enviarla: si dos admins reenvían a la vez, nadie recibe la misma respuesta dos veces.
 */
export async function resendFailedReplies(
  { code }: { code: string },
  now = new Date(),
  send: Sender = sendWhatsAppText,
): Promise<BotSettingResult> {
  const admin = await requireAdmin();
  const pending = await db
    .select({ id: whatsappMessage.id, phone: whatsappMessage.phone, reply: whatsappMessage.reply })
    .from(whatsappMessage)
    .where(resendable(now))
    .orderBy(desc(whatsappMessage.receivedAt))
    .limit(MAX_RESENDS);
  if (pending.length === 0) return { ok: false, error: "No hay respuestas para reenviar." };
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return { ok: false, error: check.error, field: "code" };

  let resent = 0;
  let failed = 0;
  for (const message of pending) {
    const [claimed] = await db
      .update(whatsappMessage)
      .set({ status: "processed" })
      .where(and(eq(whatsappMessage.id, message.id), eq(whatsappMessage.status, "failed")))
      .returning({ id: whatsappMessage.id });
    if (!claimed) continue;
    const result = await send(message.phone, message.reply!);
    if (result.ok) {
      resent++;
    } else {
      failed++;
      await db
        .update(whatsappMessage)
        .set({ status: "failed", error: `envío: ${result.error}` })
        .where(eq(whatsappMessage.id, message.id));
    }
  }
  await recordEvent({ type: "bot_replies_resent", userId: null, adminId: admin.id, details: { resent, failed } });

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (resent === 0) {
    return { ok: false, error: `No salió ninguna: WhatsApp rechazó ${failed === 1 ? "la respuesta" : `las ${failed} respuestas`} otra vez.` };
  }
  return {
    ok: true,
    message: `Se ${resent === 1 ? "reenvió" : "reenviaron"} ${plural(resent, "respuesta", "respuestas")}${
      failed ? `; ${plural(failed, "no salió", "no salieron")} otra vez` : ""
    }.`,
  };
}
