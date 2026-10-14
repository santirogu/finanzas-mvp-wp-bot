import "server-only";
import { and, desc, eq, isNotNull, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import { transaction } from "@/db/schema";
import type { ParsedTransaction } from "@/modules/bot/normalize";

type CategoryRef = { id: string; name: string };

/**
 * Registra los movimientos que interpretó el bot a partir de un mensaje.
 * external_id = "<wamid>:<índice>" hace la operación idempotente si Meta reenvía el mensaje.
 */
export async function createTransactionsFromMessage(input: {
  userId: string;
  currency: string;
  messageId: string;
  items: ParsedTransaction[];
  categories: Record<"income" | "expense", CategoryRef[]>;
}) {
  const rows = input.items.map((item, index) => ({
    userId: input.userId,
    type: item.type,
    amount: item.amount,
    currency: input.currency,
    description: item.description,
    categoryId: input.categories[item.type].find((c) => c.name === item.category)?.id ?? null,
    occurredOn: item.occurredOn,
    source: "whatsapp" as const,
    externalId: `${input.messageId}:${index}`,
  }));
  return db
    .insert(transaction)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: transaction.id });
}

/** Elimina (borrado lógico) todos los movimientos del último mensaje de WhatsApp registrado. */
export async function undoLastWhatsAppEntry(userId: string) {
  const [last] = await db
    .select({ externalId: transaction.externalId })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.source, "whatsapp"),
        isNotNull(transaction.externalId),
        isNull(transaction.deletedAt),
      ),
    )
    .orderBy(desc(transaction.createdAt))
    .limit(1);
  if (!last?.externalId) return [];

  const messageId = last.externalId.slice(0, last.externalId.lastIndexOf(":"));
  return db
    .update(transaction)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(transaction.userId, userId),
        like(transaction.externalId, `${messageId.replace(/[%_\\]/g, "\\$&")}:%`),
        isNull(transaction.deletedAt),
      ),
    )
    .returning({
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
    });
}
