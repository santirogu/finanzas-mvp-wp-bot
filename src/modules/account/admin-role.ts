import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { session, twoFactor, user } from "@/db/schema";

// Dar y quitar el rol de admin: lo mismo desde la app (el super admin en /admin/usuarios, que además
// lo registra en el historial) y desde la terminal (pnpm admin:grant / admin:revoke). Quien llama
// valida quién puede hacerlo; aquí solo se hace el cambio, dentro de la transacción que reciba.

type Executor = Pick<typeof db, "update" | "delete">;

/** Cuántas sesiones abiertas cerró (las vencidas que sigan guardadas también se borran, pero no cuentan). */
async function closeSessions(userId: string, now: Date, tx: Executor): Promise<number> {
  const closed = await tx.delete(session).where(eq(session.userId, userId)).returning({ expiresAt: session.expiresAt });
  return closed.filter((s) => s.expiresAt > now).length;
}

/**
 * Le da el rol de admin y cierra todas sus sesiones: al volver a entrar, después de la contraseña va
 * directo a configurar la verificación en dos pasos (afterLoginPath, src/lib/roles.ts). null si la
 * cuenta ya no existe.
 */
export async function grantAdminRole(
  userId: string,
  { now = new Date(), tx = db }: { now?: Date; tx?: Executor } = {},
): Promise<{ sessionsClosed: number } | null> {
  const updated = await tx.update(user).set({ role: "admin" }).where(eq(user.id, userId)).returning({ id: user.id });
  if (updated.length === 0) return null;
  return { sessionsClosed: await closeSessions(userId, now, tx) };
}

/**
 * Le quita el rol de admin: vuelve a ser usuario, pierde la marca de super admin (si la tenía), se
 * borran su verificación en dos pasos (la clave y los códigos de respaldo: vuelve a entrar solo con su
 * contraseña) y se cierran todas sus sesiones, que eran de admin. Sus finanzas no se tocan. null si
 * la cuenta ya no existe.
 */
export async function revokeAdminRole(
  userId: string,
  { now = new Date(), tx = db }: { now?: Date; tx?: Executor } = {},
): Promise<{ sessionsClosed: number } | null> {
  const updated = await tx
    .update(user)
    .set({ role: "user", superAdmin: false, twoFactorEnabled: false })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (updated.length === 0) return null;
  await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
  return { sessionsClosed: await closeSessions(userId, now, tx) };
}
