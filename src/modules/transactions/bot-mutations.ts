import "server-only";
import { and, desc, eq, isNotNull, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import { transaction } from "@/db/schema";
import type { ParsedTransaction } from "@/modules/bot/normalize";
import { addGmf } from "./gmf";

type CategoryRef = { id: string; name: string };

/**
 * Registra los movimientos que interpretó el bot a partir de un mensaje.
 * external_id = "<wamid>:<índice>" hace la operación idempotente si Meta reenvía el mensaje.
 */
export async function createTransactionsFromMessage(input: {
  userId: string;
  messageId: string;
  items: ParsedTransaction[];
  categories: Record<"income" | "expense", CategoryRef[]>;
}) {
  const rows = input.items.map((item, index) => ({
    userId: input.userId,
    type: item.type,
    amount: item.amount,
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
    // Con lo necesario para los avisos de presupuesto. Un mensaje que Meta reenvía no guarda nada: no avisa dos veces.
    .returning({ id: transaction.id, type: transaction.type, categoryId: transaction.categoryId, amount: transaction.amount, occurredOn: transaction.occurredOn });
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

/** Un id de mensaje para un LIKE: sin comodines (% y _) ni la barra que los escapa. */
const likePrefix = (messageId: string) => `${messageId.replace(/[%_\\]/g, "\\$&")}:%`;

/**
 * El "Sí" del 4x1000: registra el de cada egreso del mensaje `messageId` que siga ahí (sin deshacer) y no lo tenga.
 * `found`: cuántos egresos del mensaje quedan; `added`: los 4x1000 que se registraron ahora.
 */
export async function addGmfToMessage(userId: string, messageId: string) {
  const parents = await db
    .select({ id: transaction.id, amount: transaction.amount, description: transaction.description, occurredOn: transaction.occurredOn, externalId: transaction.externalId })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        like(transaction.externalId, likePrefix(messageId)),
        eq(transaction.type, "expense"),
        isNull(transaction.taxOf),
        isNull(transaction.deletedAt),
      ),
    );
  const added = await addGmf(parents.map((parent) => ({ ...parent, userId, source: "whatsapp" as const })));
  return { found: parents.length, added };
}
