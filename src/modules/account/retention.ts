import "server-only";
import { and, count, eq, isNotNull, isNull, lt, notExists } from "drizzle-orm";
import { db } from "@/db";
import { accountEvent, transaction, whatsappLink, whatsappMessage } from "@/db/schema";

// Cuánto se conserva lo que ya no tiene uso (lo promete /privacidad). Lo borra cada día Vercel Cron
// (src/app/api/cron/limpieza/route.ts); `pnpm messages:cleanup` sigue sirviendo para hacerlo a mano.
export const RETENTION_DAYS = {
  /** Mensajes e intentos de vinculación de números sin cuenta. */
  orphans: 30,
  /** Movimientos eliminados (dejan de verse al eliminarlos y se borran del todo después). */
  deletedTransactions: 30,
} as const;

/**
 * Datos sin dueño anteriores a `before`: mensajes de WhatsApp e intentos fallidos de vinculación de
 * números que no están vinculados a ninguna cuenta. Si el número está vinculado, son de antes de
 * vincularlo y se borran con la cuenta.
 */
const unlinked = (phone: typeof whatsappMessage.phone | typeof accountEvent.phone) =>
  notExists(db.select().from(whatsappLink).where(eq(whatsappLink.phone, phone)));

function orphanMessages(before: Date) {
  return and(isNull(whatsappMessage.userId), lt(whatsappMessage.receivedAt, before), unlinked(whatsappMessage.phone));
}

function orphanEvents(before: Date) {
  return and(isNull(accountEvent.userId), lt(accountEvent.createdAt, before), unlinked(accountEvent.phone));
}

export type OrphanCounts = { messages: number; events: number; phones: number };

export async function countOrphanData(before: Date): Promise<OrphanCounts> {
  const [[messages], [events], messagePhones, eventPhones] = await Promise.all([
    db.select({ n: count() }).from(whatsappMessage).where(orphanMessages(before)),
    db.select({ n: count() }).from(accountEvent).where(orphanEvents(before)),
    db.selectDistinct({ phone: whatsappMessage.phone }).from(whatsappMessage).where(orphanMessages(before)),
    db.selectDistinct({ phone: accountEvent.phone }).from(accountEvent).where(orphanEvents(before)),
  ]);
  // Un mismo número puede tener mensajes e intentos: se cuenta una vez.
  const phones = new Set([...messagePhones, ...eventPhones].map((row) => row.phone));
  return { messages: messages.n, events: events.n, phones: phones.size };
}

/** Borra los datos sin dueño anteriores a `before` y devuelve cuántos borró. */
export async function deleteOrphanData(before: Date): Promise<{ messages: number; events: number }> {
  return db.transaction(async (tx) => {
    const messages = await tx.delete(whatsappMessage).where(orphanMessages(before)).returning({ id: whatsappMessage.id });
    const events = await tx.delete(accountEvent).where(orphanEvents(before)).returning({ id: accountEvent.id });
    return { messages: messages.length, events: events.length };
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

/** Borra del todo los movimientos eliminados antes de `before` y devuelve cuántos. */
export async function purgeDeletedTransactions(before: Date): Promise<number> {
  const purged = await db
    .delete(transaction)
    .where(and(isNotNull(transaction.deletedAt), lt(transaction.deletedAt, before)))
    .returning({ id: transaction.id });
  return purged.length;
}

export type CleanupResult = { messages: number; events: number; transactions: number };

/** La limpieza diaria: solo cantidades en el resultado (va a los logs). */
export async function runDailyCleanup(now = new Date()): Promise<CleanupResult> {
  const orphans = await deleteOrphanData(daysBefore(now, RETENTION_DAYS.orphans));
  const transactions = await purgeDeletedTransactions(daysBefore(now, RETENTION_DAYS.deletedTransactions));
  return { ...orphans, transactions };
}
