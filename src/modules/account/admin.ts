import "server-only";
import { and, count, countDistinct, eq, isNull, lt, notExists } from "drizzle-orm";
import { db } from "@/db";
import { category, transaction, user, whatsappLink, whatsappMessage } from "@/db/schema";
import { normalizeEmail } from "@/modules/auth/lockout";
import { accountMessages } from "./delete-account";

// Consultas para el comando de terminal scripts/delete-data.ts (lo usa el dueño de la app, no la
// web): muestran qué se va a borrar antes de pedir la confirmación.

export type AccountSummary = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  createdAt: Date;
  transactions: number;
  categories: number;
  phone: string | null;
  messages: number;
};

/** La cuenta de ese correo y cuánto se borraría con ella (lo mismo que deleteAccountData). */
export async function findAccountByEmail(email: string): Promise<AccountSummary | null> {
  const [account] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.email, normalizeEmail(email)));
  if (!account) return null;

  const [link] = await db
    .select({ phone: whatsappLink.phone })
    .from(whatsappLink)
    .where(eq(whatsappLink.userId, account.id));
  const phone = link?.phone ?? null;
  const [[transactions], [categories], [messages]] = await Promise.all([
    db.select({ n: count() }).from(transaction).where(eq(transaction.userId, account.id)),
    db.select({ n: count() }).from(category).where(eq(category.userId, account.id)),
    db.select({ n: count() }).from(whatsappMessage).where(accountMessages(account.id, phone)),
  ]);

  return {
    ...account,
    transactions: transactions.n,
    categories: categories.n,
    phone,
    messages: messages.n,
  };
}

/**
 * Mensajes de WhatsApp sin dueño, recibidos antes de `before`: no están asociados a ninguna cuenta
 * y su número no está vinculado (si lo está, son de antes de vincularlo y se borran con la cuenta).
 */
function orphanMessages(before: Date) {
  return and(
    isNull(whatsappMessage.userId),
    lt(whatsappMessage.receivedAt, before),
    notExists(db.select().from(whatsappLink).where(eq(whatsappLink.phone, whatsappMessage.phone))),
  );
}

export async function countOrphanMessages(before: Date): Promise<{ messages: number; phones: number }> {
  const [row] = await db
    .select({ messages: count(), phones: countDistinct(whatsappMessage.phone) })
    .from(whatsappMessage)
    .where(orphanMessages(before));
  return row;
}

/** Borra los mensajes sin dueño anteriores a `before` y devuelve cuántos borró. */
export async function deleteOrphanMessages(before: Date): Promise<number> {
  const deleted = await db
    .delete(whatsappMessage)
    .where(orphanMessages(before))
    .returning({ id: whatsappMessage.id });
  return deleted.length;
}
