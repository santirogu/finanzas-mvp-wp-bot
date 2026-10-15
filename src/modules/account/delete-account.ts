import "server-only";
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { accountEvent, loginFailure, user, whatsappLink, whatsappMessage } from "@/db/schema";

/**
 * Borra la cuenta y todos sus datos, en una sola transacción. Al borrar el usuario, la base borra
 * en cascada las sesiones, las credenciales, los movimientos, las categorías propias y el vínculo
 * y los códigos de WhatsApp. Lo que no está atado a la cuenta por una clave foránea se borra aquí:
 *  - los mensajes de WhatsApp (su clave foránea es "set null": sin esto quedarían el número y el
 *    texto), incluidos los que se enviaron desde el número vinculado antes de vincularlo;
 *  - los intentos fallidos de login, que se guardan por correo;
 *  - los intentos fallidos de vinculación desde su número, que no tienen cuenta (los demás eventos
 *    de su historial se borran en cascada con el usuario).
 */
/**
 * Los mensajes de WhatsApp de una cuenta: los asociados a ella y, si tiene un número vinculado,
 * todos los de ese número (también los de antes de vincularlo, que no tienen usuario).
 */
export function accountMessages(userId: string, linkedPhone: string | null): SQL | undefined {
  return linkedPhone
    ? or(eq(whatsappMessage.userId, userId), eq(whatsappMessage.phone, linkedPhone))
    : eq(whatsappMessage.userId, userId);
}

/**
 * El historial de una cuenta: sus eventos y, si tiene un número vinculado, los intentos fallidos de
 * vinculación desde ese número (no tienen cuenta: el código era inválido).
 */
export function accountEvents(userId: string, linkedPhone: string | null): SQL | undefined {
  return linkedPhone
    ? or(eq(accountEvent.userId, userId), and(isNull(accountEvent.userId), eq(accountEvent.phone, linkedPhone)))
    : eq(accountEvent.userId, userId);
}

export async function deleteAccountData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [account] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
    if (!account) return;
    const [link] = await tx
      .select({ phone: whatsappLink.phone })
      .from(whatsappLink)
      .where(eq(whatsappLink.userId, userId));

    await tx.delete(whatsappMessage).where(accountMessages(userId, link?.phone ?? null));
    await tx.delete(accountEvent).where(accountEvents(userId, link?.phone ?? null));
    await tx.delete(loginFailure).where(eq(loginFailure.email, account.email.toLowerCase()));
    await tx.delete(user).where(eq(user.id, userId));
  });
}
