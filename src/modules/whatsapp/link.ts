import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, count, eq, gt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountEvent, user, whatsappLink, whatsappLinkCode } from "@/db/schema";
import { recordEvent, recordEvents, type NewAccountEvent } from "@/modules/account/events";
import { HOUR_MS, LINK_LIMITS } from "@/modules/bot/limits";

const CODE_TTL_MS = 10 * 60 * 1000;

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Bloqueo hasta el final de la transacción: serializa lo que se cuenta y se registra de una misma clave. */
const lockFor = (tx: Executor, key: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);

/** Eventos de un tipo en la última hora que cumplen `where` (para los límites de vinculación). */
async function eventsInLastHour(tx: Executor, where: ReturnType<typeof and>) {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(accountEvent)
    .where(and(where, gt(accountEvent.createdAt, new Date(Date.now() - HOUR_MS))));
  return total;
}

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** Se generaron demasiados códigos en la última hora (LINK_LIMITS.codesPerHour). */
export class LinkCodeLimitError extends Error {
  constructor() {
    // Sin "usa el último": la tarjeta de Mi cuenta deja de mostrarlo al llegar a este tope.
    super("Ya pediste varios códigos en la última hora. Espera un rato para pedir otro.");
    this.name = "LinkCodeLimitError";
  }
}

/**
 * Genera un código de 6 dígitos válido por 10 minutos y reemplaza el anterior del usuario. Máximo
 * LINK_LIMITS.codesPerHour por hora (cada código queda en el historial de la cuenta): si no, lanza
 * LinkCodeLimitError.
 */
export async function createLinkCode(userId: string) {
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await db.transaction(async (tx) => {
        await lockFor(tx, `link-codes:${userId}`);
        const recent = await eventsInLastHour(
          tx,
          and(eq(accountEvent.type, "whatsapp_code_created"), eq(accountEvent.userId, userId)),
        );
        if (recent >= LINK_LIMITS.codesPerHour) throw new LinkCodeLimitError();
        await tx
          .insert(whatsappLinkCode)
          .values({ userId, codeHash: hashCode(code), expiresAt })
          .onConflictDoUpdate({
            target: whatsappLinkCode.userId,
            set: { codeHash: hashCode(code), expiresAt },
          });
        await recordEvent({ type: "whatsapp_code_created", userId }, tx);
      });
      return { code, expiresAt };
    } catch (error) {
      // Choque improbable con el código vigente de otro usuario: se genera otro.
      if (error instanceof LinkCodeLimitError || attempt === 4) throw error;
    }
  }
  throw new Error("No se pudo generar el código");
}

/** `locale`: el idioma de la cuenta (`user.locale`; null si nunca lo eligió), para la respuesta del bot. */
export type LinkResult =
  { ok: true; userId: string; name: string; locale: string | null } | { ok: false; reason: "invalid" | "rate_limited" };

/**
 * Vincula el número que envió "VINCULAR <código>" a la cuenta dueña del código. Máximo
 * LINK_LIMITS.failedAttemptsPerHour códigos equivocados por hora y número. Los intentos se cuentan y
 * se registran en la misma transacción, con un bloqueo por número: no dependen de que la respuesta
 * llegue a WhatsApp, y varios mensajes simultáneos no se saltan el límite.
 */
export async function consumeLinkCode(phone: string, code: string): Promise<LinkResult> {
  return db.transaction(async (tx) => {
    await lockFor(tx, `link-attempts:${phone}`);
    const failedFromPhone = (reason: "invalid_code" | "rate_limited") =>
      and(
        eq(accountEvent.type, "whatsapp_link_failed"),
        eq(accountEvent.phone, phone),
        sql`${accountEvent.details}->>'reason' = ${reason}`,
      );
    if ((await eventsInLastHour(tx, failedFromPhone("invalid_code"))) >= LINK_LIMITS.failedAttemptsPerHour) {
      // Un solo registro por hora del bloqueo: repetir el intento no llena el historial.
      if ((await eventsInLastHour(tx, failedFromPhone("rate_limited"))) === 0) {
        await recordEvent({ type: "whatsapp_link_failed", userId: null, phone, details: { reason: "rate_limited" } }, tx);
      }
      return { ok: false, reason: "rate_limited" } as const;
    }

    const [pending] = await tx
      .delete(whatsappLinkCode)
      .where(
        and(
          eq(whatsappLinkCode.codeHash, hashCode(code)),
          gt(whatsappLinkCode.expiresAt, new Date()),
        ),
      )
      .returning({ userId: whatsappLinkCode.userId });
    if (!pending) {
      await recordEvent({ type: "whatsapp_link_failed", userId: null, phone, details: { reason: "invalid_code" } }, tx);
      return { ok: false, reason: "invalid" } as const;
    }

    // Un número pertenece a una sola cuenta y una cuenta tiene un solo número: lo que se reemplaza
    // queda en el historial como desvinculado (el número pasó a otra cuenta, o la cuenta cambió de
    // número).
    const replaced = await tx
      .delete(whatsappLink)
      .where(or(eq(whatsappLink.phone, phone), eq(whatsappLink.userId, pending.userId)))
      .returning({ userId: whatsappLink.userId, phone: whatsappLink.phone });
    await tx.insert(whatsappLink).values({ userId: pending.userId, phone });
    const events: NewAccountEvent[] = replaced
      .filter((link) => !(link.userId === pending.userId && link.phone === phone))
      .map((link) => ({
        type: "whatsapp_unlinked",
        userId: link.userId,
        phone: link.phone,
        details: { reason: link.userId === pending.userId ? "number_changed" : "number_moved" },
      }));
    events.push({ type: "whatsapp_linked", userId: pending.userId, phone });
    await recordEvents(events, tx);

    const [owner] = await tx
      .select({ name: user.name, locale: user.locale })
      .from(user)
      .where(eq(user.id, pending.userId));
    return { ok: true, userId: pending.userId, name: owner?.name ?? "", locale: owner?.locale ?? null } as const;
  });
}

export async function getLinkForUser(userId: string) {
  const [link] = await db
    .select({ phone: whatsappLink.phone, linkedAt: whatsappLink.linkedAt })
    .from(whatsappLink)
    .where(eq(whatsappLink.userId, userId));
  return link ?? null;
}

export async function getUserByPhone(phone: string) {
  const [row] = await db
    .select({ id: user.id, name: user.name, timezone: user.timezone, currency: user.currency, locale: user.locale, suspendedAt: user.suspendedAt })
    .from(whatsappLink)
    .innerJoin(user, eq(user.id, whatsappLink.userId))
    .where(eq(whatsappLink.phone, phone));
  return row ?? null;
}

/**
 * Desvincula el número de la cuenta (y borra su código pendiente). La desvincula la propia cuenta o,
 * con `adminId`, el admin desde /admin/usuarios. Devuelve el número que tenía, o null si no tenía.
 */
export async function unlinkUser(userId: string, { adminId }: { adminId?: string } = {}): Promise<string | null> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(whatsappLink)
      .where(eq(whatsappLink.userId, userId))
      .returning({ phone: whatsappLink.phone });
    await tx.delete(whatsappLinkCode).where(eq(whatsappLinkCode.userId, userId));
    await recordEvents(
      removed.map(({ phone }) => ({
        type: "whatsapp_unlinked",
        userId,
        phone,
        details: { reason: adminId ? "by_admin" : "by_user" },
        adminId: adminId ?? null,
      })),
      tx,
    );
    return removed[0]?.phone ?? null;
  });
}
