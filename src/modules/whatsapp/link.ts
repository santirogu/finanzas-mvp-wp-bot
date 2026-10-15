import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, count, eq, gt, or } from "drizzle-orm";
import { db } from "@/db";
import { user, whatsappLink, whatsappLinkCode, whatsappMessage } from "@/db/schema";
import { recordEvent, recordEvents, type NewAccountEvent } from "@/modules/account/events";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPTS_PER_HOUR = 5;

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** Genera un código de 6 dígitos válido por 10 minutos. Reemplaza el anterior del usuario. */
export async function createLinkCode(userId: string) {
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await db.transaction(async (tx) => {
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
      if (attempt === 4) throw error;
    }
  }
  throw new Error("No se pudo generar el código");
}

export type LinkResult =
  { ok: true; userId: string; name: string } | { ok: false; reason: "invalid" | "rate_limited" };

/** Vincula el número que envió "VINCULAR <código>" a la cuenta dueña del código. */
export async function consumeLinkCode(phone: string, code: string): Promise<LinkResult> {
  const [{ failures }] = await db
    .select({ failures: count() })
    .from(whatsappMessage)
    .where(
      and(
        eq(whatsappMessage.phone, phone),
        eq(whatsappMessage.status, "link_failed"),
        gt(whatsappMessage.receivedAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    );
  if (failures >= MAX_FAILED_ATTEMPTS_PER_HOUR) {
    await recordEvent({ type: "whatsapp_link_failed", userId: null, phone, details: { reason: "rate_limited" } });
    return { ok: false, reason: "rate_limited" };
  }

  return db.transaction(async (tx) => {
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
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, pending.userId));
    return { ok: true, userId: pending.userId, name: owner?.name ?? "" } as const;
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
    .select({ id: user.id, name: user.name, timezone: user.timezone, currency: user.currency, suspendedAt: user.suspendedAt })
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
