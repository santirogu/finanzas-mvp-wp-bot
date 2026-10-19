import "server-only";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginFailure, session, user, whatsappLink, whatsappLinkCode } from "@/db/schema";
import { hasRole, isSuperAdmin, type Role } from "@/lib/roles";
import { requireAdmin, requireSuperAdmin } from "@/lib/session";
import { grantAdminRole, revokeAdminRole } from "@/modules/account/admin-role";
import { deleteAccountData } from "@/modules/account/delete-account";
import { recordEvent } from "@/modules/account/events";
import { normalizeEmail } from "@/modules/auth/lockout";
import { unlinkUser } from "@/modules/whatsapp/link";
import { confirmAdminCode } from "../shared/confirm-code";
import { cleanNote } from "../shared/filters";
import { isValidUserId } from "./user-filters";

// Las acciones del admin sobre una cuenta (/admin/usuarios/[id]): desbloquear, cerrar sesiones,
// desvincular WhatsApp, suspender, reactivar y eliminar; y, solo el super admin, dar y quitar el rol
// de admin. Cada una:
//  1. valida el rol (requireAdmin; requireSuperAdmin para los roles), como toda la capa de datos de
//     administración;
//  2. revisa la cuenta: que exista, que no sea la propia ni (salvo para quitarle el rol) la de otro
//     admin, y que la acción aplique (si no hay nada que hacer, no gasta el código);
//  3. confirma el código de Google Authenticator (confirmAdminCode: límite de intentos, un solo uso);
//  4. hace el cambio y lo registra en el historial con el admin, en la misma transacción.

export type AdminActionInput = { userId: string; code: string };

export type AdminActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; field?: "code" | "email" };

type Target = {
  id: string;
  name: string;
  email: string;
  role: Role;
  superAdmin: boolean;
  phone: string | null;
  locked: boolean;
  suspended: boolean;
  openSessions: number;
};

/** Las cuentas de admin solo admiten que el super admin les quite el rol (`admins: true`). */
async function loadTarget(
  userId: string,
  adminId: string,
  now: Date,
  { admins = false }: { admins?: boolean } = {},
): Promise<Target | { error: string }> {
  if (!isValidUserId(userId)) return { error: "Esta cuenta ya no existe." };
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      superAdmin: user.superAdmin,
      phone: whatsappLink.phone,
      lockedUntil: loginFailure.lockedUntil,
      suspendedAt: user.suspendedAt,
    })
    .from(user)
    .leftJoin(whatsappLink, eq(whatsappLink.userId, user.id))
    .leftJoin(loginFailure, eq(loginFailure.email, sql`lower(${user.email})`))
    .where(eq(user.id, userId));
  if (!row) return { error: "Esta cuenta ya no existe." };
  if (row.id === adminId) return { error: "Para tu propia cuenta usa Mi cuenta o Seguridad." };
  if (!admins && hasRole(row.role, "admin")) return { error: "Las cuentas de admin no se cambian desde aquí." };
  const [{ openSessions }] = await db
    .select({ openSessions: count() })
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, now)));
  const { lockedUntil, suspendedAt, ...target } = row;
  return { ...target, locked: Boolean(lockedUntil && lockedUntil > now), suspended: suspendedAt !== null, openSessions };
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
 * Suspende la cuenta hasta que el admin la reactive: cierra sus sesiones y su código de vinculación
 * pendiente; no puede volver a entrar ni usar el bot. Sus datos se conservan. El motivo (opcional)
 * es interno: queda en la cuenta y en el historial, y la persona no lo ve.
 */
export async function suspendAccount(
  { userId, code, reason = "" }: AdminActionInput & { reason?: string },
  now = new Date(),
): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const target = await loadTarget(userId, admin.id, now);
  if ("error" in target) return fail(target.error);
  if (target.suspended) return fail("La cuenta ya está suspendida.");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  const note = cleanNote(reason);
  await db.transaction(async (tx) => {
    await tx.update(user).set({ suspendedAt: now, suspensionReason: note || null }).where(eq(user.id, target.id));
    const closed = await tx.delete(session).where(eq(session.userId, target.id)).returning({ expiresAt: session.expiresAt });
    await tx.delete(whatsappLinkCode).where(eq(whatsappLinkCode.userId, target.id));
    const sessions = closed.filter((s) => s.expiresAt > now).length;
    await recordEvent(
      { type: "account_suspended", userId: target.id, adminId: admin.id, details: { ...(note && { note }), ...(sessions && { sessions }) } },
      tx,
    );
  });
  return { ok: true, message: `Se suspendió la cuenta de ${target.name}.` };
}

/** Levanta la suspensión: puede volver a entrar y a usar el bot. */
export async function reactivateAccount({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const target = await loadTarget(userId, admin.id, now);
  if ("error" in target) return fail(target.error);
  if (!target.suspended) return fail("La cuenta no está suspendida.");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx.update(user).set({ suspendedAt: null, suspensionReason: null }).where(eq(user.id, target.id));
    await recordEvent({ type: "account_reactivated", userId: target.id, adminId: admin.id }, tx);
  });
  return { ok: true, message: `Se reactivó la cuenta de ${target.name}.` };
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

/**
 * Le da el rol de admin (solo el super admin). No a una cuenta suspendida: primero hay que
 * reactivarla. Cierra sus sesiones: al volver a entrar va directo a configurar la verificación en dos
 * pasos, obligatoria para administrar.
 */
export async function grantAdmin({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireSuperAdmin();
  const target = await loadTarget(userId, admin.id, now, { admins: true });
  if ("error" in target) return fail(target.error);
  if (hasRole(target.role, "admin")) return fail("La cuenta ya es admin.");
  if (target.suspended) return fail("La cuenta está suspendida: primero reactívala.");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  const granted = await db.transaction(async (tx) => {
    const result = await grantAdminRole(target.id, { now, tx });
    if (!result) return false;
    const sessions = result.sessionsClosed;
    await recordEvent({ type: "admin_granted", userId: target.id, adminId: admin.id, details: { ...(sessions && { sessions }) } }, tx);
    return true;
  });
  if (!granted) return fail("Esta cuenta ya no existe.");
  return { ok: true, message: `${target.name} ahora es admin.` };
}

/**
 * Le quita el rol de admin (solo el super admin, y nunca al super admin): vuelve a ser usuario, se
 * borra su verificación en dos pasos y se cierran sus sesiones.
 */
export async function revokeAdmin({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireSuperAdmin();
  const target = await loadTarget(userId, admin.id, now, { admins: true });
  if ("error" in target) return fail(target.error);
  if (!hasRole(target.role, "admin")) return fail("La cuenta no es admin.");
  if (isSuperAdmin(target.role, target.superAdmin)) return fail("Al super admin no se le quita el rol desde la app.");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  const revoked = await db.transaction(async (tx) => {
    const result = await revokeAdminRole(target.id, { now, tx });
    if (!result) return false;
    const sessions = result.sessionsClosed;
    await recordEvent({ type: "admin_revoked", userId: target.id, adminId: admin.id, details: { ...(sessions && { sessions }) } }, tx);
    return true;
  });
  if (!revoked) return fail("Esta cuenta ya no existe.");
  return { ok: true, message: `${target.name} ya no es admin.` };
}
