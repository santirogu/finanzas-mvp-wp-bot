import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { ACCOUNT_SUSPENDED } from "@/lib/auth-errors";

// Cuentas suspendidas por el admin (/admin/usuarios): no pueden crear sesiones (Better Auth,
// src/lib/auth.ts), la sesión que quedara no sirve (src/lib/session.ts) y el bot no registra lo que
// escriban (src/modules/bot/handle-message.ts). Sus datos se conservan hasta que el admin la
// reactive o la elimine. A la persona no se le dice el motivo.

/** Lo que ve la persona al intentar entrar (el formulario lo muestra por el código ACCOUNT_SUSPENDED). */
export const SUSPENDED_MESSAGE = ACCOUNT_SUSPENDED;

/** ¿Está suspendida? (Una cuenta que no existe, no.) */
export async function isSuspended(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), isNotNull(user.suspendedAt)));
  return Boolean(row);
}
