import "server-only";
import { createHash, randomInt } from "node:crypto";
import { and, count, eq, gt, or } from "drizzle-orm";
import { db } from "@/db";
import { user, whatsappLink, whatsappLinkCode, whatsappMessage } from "@/db/schema";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPTS_PER_HOUR = 5;

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** Genera un código de 6 dígitos válido por 10 minutos. Reemplaza el anterior del usuario. */
export async function createLinkCode(userId: string) {
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await db
        .insert(whatsappLinkCode)
        .values({ userId, codeHash: hashCode(code), expiresAt })
        .onConflictDoUpdate({
          target: whatsappLinkCode.userId,
          set: { codeHash: hashCode(code), expiresAt },
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
  if (failures >= MAX_FAILED_ATTEMPTS_PER_HOUR) return { ok: false, reason: "rate_limited" };

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
    if (!pending) return { ok: false, reason: "invalid" } as const;

    // Un número pertenece a una sola cuenta y una cuenta tiene un solo número.
    await tx
      .delete(whatsappLink)
      .where(or(eq(whatsappLink.phone, phone), eq(whatsappLink.userId, pending.userId)));
    await tx.insert(whatsappLink).values({ userId: pending.userId, phone });

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
    .select({ id: user.id, name: user.name, timezone: user.timezone, currency: user.currency })
    .from(whatsappLink)
    .innerJoin(user, eq(user.id, whatsappLink.userId))
    .where(eq(whatsappLink.phone, phone));
  return row ?? null;
}

export async function unlinkUser(userId: string) {
  await db.delete(whatsappLink).where(eq(whatsappLink.userId, userId));
  await db.delete(whatsappLinkCode).where(eq(whatsappLinkCode.userId, userId));
}
