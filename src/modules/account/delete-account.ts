import "server-only";
import { and, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { accountEvent, loginFailure, signupInvite, user, whatsappLink, whatsappMessage } from "@/db/schema";
import { recordEvent } from "./events";

/**
 * Borra la cuenta y todos sus datos, en una sola transacción. Al borrar el usuario, la base borra
 * en cascada las sesiones, las credenciales, los movimientos, las categorías propias y el vínculo
 * y los códigos de WhatsApp. Lo que no está atado a la cuenta por una clave foránea se borra aquí:
 *  - los mensajes de WhatsApp (su clave foránea es "set null": sin esto quedarían el número y el
 *    texto), incluidos los que se enviaron sin cuenta desde cualquiera de sus números (el actual y
 *    los que tuvo antes), por ejemplo antes de vincularlos;
 *  - los intentos fallidos de login, que se guardan por correo;
 *  - los intentos fallidos de vinculación desde sus números, que no tienen cuenta (los demás eventos
 *    de su historial se borran en cascada con el usuario);
 *  - la invitación de su correo (Configuración del admin), y el correo en los eventos del admin que la
 *    agregaron o la quitaron: quedan como "invitó a alguien".
 */
type Executor = Pick<typeof db, "select" | "selectDistinct">;

/**
 * Los números de WhatsApp que tuvo la cuenta: el vinculado ahora y los que vinculó o desvinculó antes
 * (sus eventos los guardan). Sin los que hoy están vinculados a otra cuenta: lo que llegó de ellos
 * sin cuenta puede ser de esa otra persona.
 */
export async function accountPhones(userId: string, tx: Executor = db): Promise<string[]> {
  const [fromEvents, current] = await Promise.all([
    tx
      .selectDistinct({ phone: accountEvent.phone })
      .from(accountEvent)
      .where(
        and(
          eq(accountEvent.userId, userId),
          inArray(accountEvent.type, ["whatsapp_linked", "whatsapp_unlinked"]),
          isNotNull(accountEvent.phone),
        ),
      ),
    tx.select({ phone: whatsappLink.phone }).from(whatsappLink).where(eq(whatsappLink.userId, userId)),
  ]);
  const phones = new Set([...fromEvents.map((row) => row.phone!), ...current.map((row) => row.phone)]);
  if (phones.size === 0) return [];
  const ofOthers = await tx
    .select({ phone: whatsappLink.phone })
    .from(whatsappLink)
    .where(and(inArray(whatsappLink.phone, [...phones]), ne(whatsappLink.userId, userId)));
  for (const { phone } of ofOthers) phones.delete(phone);
  return [...phones].sort();
}

/**
 * Los mensajes de WhatsApp de una cuenta: los asociados a ella y los que llegaron sin cuenta desde
 * sus números (por ejemplo, antes de vincularlos). Los de otra cuenta, nunca.
 */
export function accountMessages(userId: string, phones: readonly string[]): SQL | undefined {
  return phones.length
    ? or(eq(whatsappMessage.userId, userId), and(isNull(whatsappMessage.userId), inArray(whatsappMessage.phone, [...phones])))
    : eq(whatsappMessage.userId, userId);
}

/**
 * El historial de una cuenta: sus eventos y los intentos fallidos de vinculación desde sus números
 * (no tienen cuenta: el código era inválido).
 */
export function accountEvents(userId: string, phones: readonly string[]): SQL | undefined {
  return phones.length
    ? or(eq(accountEvent.userId, userId), and(isNull(accountEvent.userId), inArray(accountEvent.phone, [...phones])))
    : eq(accountEvent.userId, userId);
}

/**
 * Con `deletedBy` (la eliminó el admin desde /admin/usuarios), en el historial queda solo
 * "account_deleted" con el admin, sin ningún dato de la cuenta. Devuelve false si no existía.
 */
export async function deleteAccountData(userId: string, { deletedBy }: { deletedBy?: string } = {}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [account] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
    if (!account) return false;
    const phones = await accountPhones(userId, tx);

    await tx.delete(whatsappMessage).where(accountMessages(userId, phones));
    await tx.delete(accountEvent).where(accountEvents(userId, phones));
    const email = account.email.toLowerCase();
    await tx.delete(loginFailure).where(eq(loginFailure.email, email));
    await tx.delete(signupInvite).where(eq(signupInvite.email, email));
    await tx
      .update(accountEvent)
      .set({ details: sql`${accountEvent.details} - 'email'` })
      .where(and(inArray(accountEvent.type, ["signup_invite_added", "signup_invite_removed"]), sql`${accountEvent.details}->>'email' = ${email}`));
    await tx.delete(user).where(eq(user.id, userId));
    if (deletedBy) await recordEvent({ type: "account_deleted", userId: null, adminId: deletedBy }, tx);
    return true;
  });
}
