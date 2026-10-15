import "server-only";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginFailure, session, user, whatsappLink } from "@/db/schema";
import { hasRole, type Role } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { deleteAccountData } from "@/modules/account/delete-account";
import { recordEvent } from "@/modules/account/events";
import { normalizeEmail } from "@/modules/auth/lockout";
import { unlinkUser } from "@/modules/whatsapp/link";
import { confirmAdminCode } from "../shared/confirm-code";
import { isValidUserId } from "./user-filters";

// Las acciones del admin sobre una cuenta (/admin/usuarios/[id]). Cada una:
//  1. valida el rol (requireAdmin), como toda la capa de datos de administración;
//  2. revisa la cuenta: que exista, que no sea la del admin ni la de otro admin (los roles solo se
//     manejan desde la terminal) y que la acción aplique (si no hay nada que hacer, no gasta el código);
//  3. confirma el código de Google Authenticator (confirmAdminCode: límite de intentos, un solo uso);
//  4. hace el cambio y lo registra en el historial con el admin, en la misma transacción.

export type AdminActionInput = { userId: string; code: string };

export type AdminActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; field?: "code" | "email" };

type Target = { id: string; name: string; email: string; role: Role; phone: string | null; locked: boolean; openSessions: number };

async function loadTarget(userId: string, adminId: string, now: Date): Promise<Target | { error: string }> {
  if (!isValidUserId(userId)) return { error: "Esta cuenta ya no existe." };
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: whatsappLink.phone,
      lockedUntil: loginFailure.lockedUntil,
    })
    .from(user)
    .leftJoin(whatsappLink, eq(whatsappLink.userId, user.id))
    .leftJoin(loginFailure, eq(loginFailure.email, sql`lower(${user.email})`))
    .where(eq(user.id, userId));
  if (!row) return { error: "Esta cuenta ya no existe." };
  if (row.id === adminId) return { error: "Para tu propia cuenta usa Mi cuenta o Seguridad." };
  if (hasRole(row.role, "admin")) return { error: "Las cuentas de admin no se cambian desde aquí: los roles se manejan desde la terminal." };
  const [{ openSessions }] = await db
    .select({ openSessions: count() })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, now)));
  const { lockedUntil, ...target } = row;
  return { ...target, locked: Boolean(lockedUntil && lockedUntil > now), openSessions };
}

const fail = (error: string, field?: "code" | "email"): AdminActionResult => ({ ok: false, error, ...(field && { field }) });

/** Levanta el bloqueo por intentos fallidos de contraseña (como si hubiera pasado el tiempo). */
export async function unlockLogin({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const target = await loadTarget(userId, admin.id, now);
  if ("error" in target) return fail(target.error);
  if (!target.locked) return fail("La cuenta ya no tiene el inicio de sesión bloqueado.");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx.delete(loginFailure).where(eq(loginFailure.email, normalizeEmail(target.email)));
    await recordEvent({ type: "login_unlocked", userId: target.id, adminId: admin.id }, tx);
  });
  return { ok: true, message: `Se desbloqueó el inicio de sesión de ${target.name}.` };
}

/** Cierra todas las sesiones de la cuenta: tendrá que volver a iniciar sesión (su WhatsApp sigue). */
export async function revokeSessions({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const target = await loadTarget(userId, admin.id, now);
  if ("error" in target) return fail(target.error);
  if (target.openSessions === 0) return fail("La cuenta ya no tiene sesiones abiertas.");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  // Todas, también las vencidas que sigan guardadas.
  const closed = await db.transaction(async (tx) => {
    const removed = await tx.delete(session).where(eq(session.userId, target.id)).returning({ expiresAt: session.expiresAt });
    const open = removed.filter((s) => s.expiresAt > now).length;
    await recordEvent({ type: "sessions_revoked", userId: target.id, adminId: admin.id, details: { sessions: open } }, tx);
    return open;
  });
  return {
    ok: true,
    message: `Se ${closed === 1 ? "cerró la sesión" : `cerraron las ${closed} sesiones`} de ${target.name}.`,
  };
}

/** Desvincula su número de WhatsApp: el bot deja de registrar lo que escriba desde él. */
export async function unlinkWhatsApp({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const target = await loadTarget(userId, admin.id, now);
  if ("error" in target) return fail(target.error);
  if (!target.phone) return fail("La cuenta ya no tiene un WhatsApp vinculado.");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await unlinkUser(target.id, { adminId: admin.id });
  return { ok: true, message: `Se desvinculó el WhatsApp de ${target.name}.` };
}

/**
 * Elimina la cuenta y todos sus datos (lo mismo que pnpm account:delete). Además del código, pide
 * escribir su correo. En el historial queda solo "account_deleted", sin datos de la cuenta.
 */
export async function deleteAccount(
  { userId, code, email }: AdminActionInput & { email: string },
  now = new Date(),
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const target = await loadTarget(userId, admin.id, now);
  if ("error" in target) return fail(target.error);
  if (normalizeEmail(email) !== normalizeEmail(target.email)) return fail("El correo no coincide con el de la cuenta.", "email");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await deleteAccountData(target.id, { deletedBy: admin.id });
  return { ok: true, message: "Se eliminó la cuenta." };
}
