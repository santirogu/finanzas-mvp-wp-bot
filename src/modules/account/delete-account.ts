import "server-only";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { loginFailure, user, whatsappLink, whatsappMessage } from "@/db/schema";

/**
 * Borra la cuenta y todos sus datos, en una sola transacción. Al borrar el usuario, la base borra
 * en cascada las sesiones, las credenciales, los movimientos, las categorías propias y el vínculo
 * y los códigos de WhatsApp. Lo que no está atado a la cuenta por una clave foránea se borra aquí:
 *  - los mensajes de WhatsApp (su clave foránea es "set null": sin esto quedarían el número y el
 *    texto), incluidos los que se enviaron desde el número vinculado antes de vincularlo;
 *  - los intentos fallidos de login, que se guardan por correo.
 */
export async function deleteAccountData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [account] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
    if (!account) return;
    const [link] = await tx
      .select({ phone: whatsappLink.phone })
      .from(whatsappLink)
      .where(eq(whatsappLink.userId, userId));

    await tx
      .delete(whatsappMessage)
      .where(
        link
          ? or(eq(whatsappMessage.userId, userId), eq(whatsappMessage.phone, link.phone))
          : eq(whatsappMessage.userId, userId),
      );
    await tx.delete(loginFailure).where(eq(loginFailure.email, account.email.toLowerCase()));
    await tx.delete(user).where(eq(user.id, userId));
  });
}
