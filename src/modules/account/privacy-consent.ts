import "server-only";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { recordEvent } from "./events";

/**
 * Guarda que la cuenta autorizó la versión vigente de la política de privacidad (src/lib/privacy.ts) y su evento en el
 * historial, que es la prueba, en una transacción. Si ya la había autorizado (dos envíos seguidos), no repite el evento.
 */
export async function acceptPrivacy(userId: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(user)
      .set({ privacyVersion: PRIVACY_VERSION, privacyAcceptedAt: now })
      .where(and(eq(user.id, userId), or(isNull(user.privacyVersion), ne(user.privacyVersion, PRIVACY_VERSION))))
      .returning({ id: user.id });
    if (updated.length === 0) return;
    await recordEvent({ type: "privacy_accepted", userId, details: { privacyVersion: PRIVACY_VERSION } }, tx);
  });
}
