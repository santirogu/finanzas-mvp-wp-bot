import "server-only";
import { and, count, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginFailure, session, user, whatsappLink, whatsappLinkCode } from "@/db/schema";
import { getRequestLocale } from "@/i18n/request";
import { texts } from "@/i18n/texts";
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
// Los mensajes van en el idioma de quien hace el pedido (la cookie), como los del código.

export type AdminActionInput = { userId: string; code: string };

export type AdminActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; field?: "code" | "email" };

const TEXTS = texts(
  {
    gone: "Esta cuenta ya no existe.",
    own: "Para tu propia cuenta usa Mi cuenta o Seguridad.",
    adminAccount: "Las cuentas de admin no se cambian desde aquí.",
    notLocked: "La cuenta ya no tiene el inicio de sesión bloqueado.",
    unlocked: (name: string) => `Se desbloqueó el inicio de sesión de ${name}.`,
    noSessions: "La cuenta ya no tiene sesiones abiertas.",
    sessionsClosed: (closed: number, name: string) =>
      `Se ${closed === 1 ? "cerró la sesión" : `cerraron las ${closed} sesiones`} de ${name}.`,
    notLinked: "La cuenta ya no tiene un WhatsApp vinculado.",
    unlinked: (name: string) => `Se desvinculó el WhatsApp de ${name}.`,
    alreadySuspended: "La cuenta ya está suspendida.",
    suspended: (name: string) => `Se suspendió la cuenta de ${name}.`,
    notSuspended: "La cuenta no está suspendida.",
    reactivated: (name: string) => `Se reactivó la cuenta de ${name}.`,
    emailMismatch: "El correo no coincide con el de la cuenta.",
    deleted: "Se eliminó la cuenta.",
    alreadyAdmin: "La cuenta ya es admin.",
    suspendedFirst: "La cuenta está suspendida: primero reactívala.",
    granted: (name: string) => `${name} ahora es admin.`,
    notAdmin: "La cuenta no es admin.",
    superAdmin: "Al super admin no se le quita el rol desde la app.",
    revoked: (name: string) => `${name} ya no es admin.`,
  },
  {
    en: {
      gone: "This account no longer exists.",
      own: "For your own account, use My account or Security.",
      adminAccount: "Admin accounts can't be changed from here.",
      notLocked: "The account's sign-in is no longer locked.",
      unlocked: (name) => `${name}'s sign-in was unlocked.`,
      noSessions: "The account no longer has open sessions.",
      sessionsClosed: (closed, name) => `${name} was signed out of ${closed === 1 ? "1 session" : `${closed} sessions`}.`,
      notLinked: "The account no longer has a linked WhatsApp.",
      unlinked: (name) => `${name}'s WhatsApp was unlinked.`,
      alreadySuspended: "The account is already suspended.",
      suspended: (name) => `${name}'s account was suspended.`,
      notSuspended: "The account isn't suspended.",
      reactivated: (name) => `${name}'s account was reactivated.`,
      emailMismatch: "The email doesn't match the account's.",
      deleted: "The account was deleted.",
      alreadyAdmin: "The account is already an admin.",
      suspendedFirst: "The account is suspended: reactivate it first.",
      granted: (name) => `${name} is now an admin.`,
      notAdmin: "The account isn't an admin.",
      superAdmin: "The super admin's role can't be removed from the app.",
      revoked: (name) => `${name} is no longer an admin.`,
    },
  },
);

type Texts = (typeof TEXTS)["es"];

const requestTexts = async (): Promise<Texts> => TEXTS[await getRequestLocale()];

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
  t: Texts,
  { admins = false }: { admins?: boolean } = {},
): Promise<Target | { error: string }> {
  if (!isValidUserId(userId)) return { error: t.gone };
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
  if (!row) return { error: t.gone };
  if (row.id === adminId) return { error: t.own };
  if (!admins && hasRole(row.role, "admin")) return { error: t.adminAccount };
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
  const t = await requestTexts();
  const target = await loadTarget(userId, admin.id, now, t);
  if ("error" in target) return fail(target.error);
  if (!target.locked) return fail(t.notLocked);
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx.delete(loginFailure).where(eq(loginFailure.email, normalizeEmail(target.email)));
    await recordEvent({ type: "login_unlocked", userId: target.id, adminId: admin.id }, tx);
  });
  return { ok: true, message: t.unlocked(target.name) };
}

/** Cierra todas las sesiones de la cuenta: tendrá que volver a iniciar sesión (su WhatsApp sigue). */
export async function revokeSessions({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const t = await requestTexts();
  const target = await loadTarget(userId, admin.id, now, t);
  if ("error" in target) return fail(target.error);
  if (target.openSessions === 0) return fail(t.noSessions);
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  // Todas, también las vencidas que sigan guardadas.
  const closed = await db.transaction(async (tx) => {
    const removed = await tx.delete(session).where(eq(session.userId, target.id)).returning({ expiresAt: session.expiresAt });
    const open = removed.filter((s) => s.expiresAt > now).length;
    await recordEvent({ type: "sessions_revoked", userId: target.id, adminId: admin.id, details: { sessions: open } }, tx);
    return open;
  });
  return { ok: true, message: t.sessionsClosed(closed, target.name) };
}

/** Desvincula su número de WhatsApp: el bot deja de registrar lo que escriba desde él. */
export async function unlinkWhatsApp({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const t = await requestTexts();
  const target = await loadTarget(userId, admin.id, now, t);
  if ("error" in target) return fail(target.error);
  if (!target.phone) return fail(t.notLinked);
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await unlinkUser(target.id, { adminId: admin.id });
  return { ok: true, message: t.unlinked(target.name) };
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
  const t = await requestTexts();
  const target = await loadTarget(userId, admin.id, now, t);
  if ("error" in target) return fail(target.error);
  if (target.suspended) return fail(t.alreadySuspended);
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
  return { ok: true, message: t.suspended(target.name) };
}

/** Levanta la suspensión: puede volver a entrar y a usar el bot. */
export async function reactivateAccount({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireAdmin();
  const t = await requestTexts();
  const target = await loadTarget(userId, admin.id, now, t);
  if ("error" in target) return fail(target.error);
  if (!target.suspended) return fail(t.notSuspended);
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx.update(user).set({ suspendedAt: null, suspensionReason: null }).where(eq(user.id, target.id));
    await recordEvent({ type: "account_reactivated", userId: target.id, adminId: admin.id }, tx);
  });
  return { ok: true, message: t.reactivated(target.name) };
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
  const t = await requestTexts();
  const target = await loadTarget(userId, admin.id, now, t);
  if ("error" in target) return fail(target.error);
  if (normalizeEmail(email) !== normalizeEmail(target.email)) return fail(t.emailMismatch, "email");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await deleteAccountData(target.id, { deletedBy: admin.id });
  return { ok: true, message: t.deleted };
}

/**
 * Le da el rol de admin (solo el super admin). No a una cuenta suspendida: primero hay que
 * reactivarla. Cierra sus sesiones: al volver a entrar va directo a configurar la verificación en dos
 * pasos, obligatoria para administrar.
 */
export async function grantAdmin({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireSuperAdmin();
  const t = await requestTexts();
  const target = await loadTarget(userId, admin.id, now, t, { admins: true });
  if ("error" in target) return fail(target.error);
  if (hasRole(target.role, "admin")) return fail(t.alreadyAdmin);
  if (target.suspended) return fail(t.suspendedFirst);
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  const granted = await db.transaction(async (tx) => {
    const result = await grantAdminRole(target.id, { now, tx });
    if (!result) return false;
    const sessions = result.sessionsClosed;
    await recordEvent({ type: "admin_granted", userId: target.id, adminId: admin.id, details: { ...(sessions && { sessions }) } }, tx);
    return true;
  });
  if (!granted) return fail(t.gone);
  return { ok: true, message: t.granted(target.name) };
}

/**
 * Le quita el rol de admin (solo el super admin, y nunca al super admin): vuelve a ser usuario, se
 * borra su verificación en dos pasos y se cierran sus sesiones.
 */
export async function revokeAdmin({ userId, code }: AdminActionInput, now = new Date()): Promise<AdminActionResult> {
  const admin = await requireSuperAdmin();
  const t = await requestTexts();
  const target = await loadTarget(userId, admin.id, now, t, { admins: true });
  if ("error" in target) return fail(target.error);
  if (!hasRole(target.role, "admin")) return fail(t.notAdmin);
  if (isSuperAdmin(target.role, target.superAdmin)) return fail(t.superAdmin);
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  const revoked = await db.transaction(async (tx) => {
    const result = await revokeAdminRole(target.id, { now, tx });
    if (!result) return false;
    const sessions = result.sessionsClosed;
    await recordEvent({ type: "admin_revoked", userId: target.id, adminId: admin.id, details: { ...(sessions && { sessions }) } }, tx);
    return true;
  });
  if (!revoked) return fail(t.gone);
  return { ok: true, message: t.revoked(target.name) };
}
