import "server-only";
import { asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appSetting, signupInvite, user } from "@/db/schema";
import { getRequestLocale } from "@/i18n/request";
import { texts } from "@/i18n/texts";
import { requireAdmin } from "@/lib/session";
import { recordEvent } from "@/modules/account/events";
import { normalizeEmail } from "@/modules/auth/lockout";
import { isSignupMode, type SignupMode } from "@/modules/auth/signup-modes";
import { getSignupMode } from "@/modules/auth/signup-policy";
import { confirmAdminCode } from "../shared/confirm-code";

// Configuración de la app → Registros (/admin/configuracion): quién puede crear una cuenta y la lista de correos
// invitados. Cambiar el modo sigue las reglas de las acciones del admin (CLAUDE.md): requireAdmin, el código de
// Google Authenticator, y la fila única de app_setting y su evento en el historial en la misma transacción.
// Agregar y quitar invitados no pide el código (excepción decidida con el dueño, como crear categorías: README →
// Seguridad → Riesgos aceptados), pero queda en el historial con el admin. El registro lo revisa
// src/modules/auth/signup-policy.ts.

export type SignupInviteView = { email: string; invitedAt: Date; usedAt: Date | null };

export type SignupSettingsView = {
  mode: SignupMode;
  invites: SignupInviteView[];
  /** El último cambio del modo, o null si nadie lo ha cambiado (abiertos, como siempre). */
  updated: { at: Date; by: string | null } | null;
};

/** El modo de los registros y los invitados: los pendientes primero, y entre ellos, los más recientes. */
export async function getSignupSettings(): Promise<SignupSettingsView> {
  await requireAdmin();
  const [mode, [row], invites] = await Promise.all([
    getSignupMode(),
    db
      .select({ at: appSetting.updatedAt, by: user.name })
      .from(appSetting)
      .leftJoin(user, eq(user.id, appSetting.updatedBy))
      .where(eq(appSetting.id, 1)),
    db
      .select({ email: signupInvite.email, invitedAt: signupInvite.createdAt, usedAt: signupInvite.usedAt })
      .from(signupInvite)
      .orderBy(sql`${signupInvite.usedAt} is not null`, desc(signupInvite.createdAt), asc(signupInvite.email)),
  ]);
  return { mode, invites, updated: row ? { at: row.at, by: row.by } : null };
}

/** Para la tarjeta de Inicio: cómo están los registros y cuántas invitaciones no se han usado. */
export async function signupSummary(): Promise<{ mode: SignupMode; pending: number }> {
  await requireAdmin();
  const [mode, [row]] = await Promise.all([getSignupMode(), db.select({ total: count() }).from(signupInvite).where(isNull(signupInvite.usedAt))]);
  return { mode, pending: row?.total ?? 0 };
}

type Field = "code" | "mode" | "email";
export type SignupSettingResult = { ok: true; message: string } | { ok: false; error: string; field?: Field };
const fail = (error: string, field?: Field): SignupSettingResult => ({ ok: false, error, ...(field && { field }) });

const TEXTS = texts(
  {
    unknownMode: "Elige una de las opciones.",
    sameMode: "Los registros ya están así: elige otra opción.",
    modes: {
      open: "Los registros quedaron abiertos: cualquiera puede crear una cuenta.",
      closed: "Los registros quedaron cerrados: nadie puede crear una cuenta nueva.",
      invite: "Ahora solo se puede crear una cuenta con invitación.",
    },
    email: "Escribe un correo válido.",
    alreadyInvited: "Ese correo ya está invitado.",
    hasAccount: "Ese correo ya tiene una cuenta.",
    invited: (email: string) => `Se invitó a ${email}`,
    notInvited: "Esa invitación ya no existe.",
    removed: (email: string) => `Se quitó la invitación de ${email}`,
  },
  {
    en: {
      unknownMode: "Choose one of the options.",
      sameMode: "Sign-ups are already like that: choose another option.",
      modes: {
        open: "Sign-ups are open: anyone can create an account.",
        closed: "Sign-ups are closed: nobody can create a new account.",
        invite: "Now you can only create an account with an invitation.",
      },
      email: "Enter a valid email.",
      alreadyInvited: "That email is already invited.",
      hasAccount: "That email already has an account.",
      invited: (email) => `${email} was invited`,
      notInvited: "That invitation no longer exists.",
      removed: (email) => `The invitation for ${email} was removed`,
    },
  },
);

/** Cambia quién puede crear una cuenta (`mode`), con el código de Google Authenticator. */
export async function setSignupMode({ mode, code }: { mode: unknown; code: string }, now = new Date()): Promise<SignupSettingResult> {
  const admin = await requireAdmin();
  const t = TEXTS[await getRequestLocale()];
  if (!isSignupMode(mode)) return fail(t.unknownMode, "mode");
  const previous = await getSignupMode();
  if (mode === previous) return fail(t.sameMode, "mode");
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx
      .insert(appSetting)
      .values({ id: 1, signupMode: mode, updatedAt: now, updatedBy: admin.id })
      .onConflictDoUpdate({ target: appSetting.id, set: { signupMode: mode, updatedAt: now, updatedBy: admin.id } });
    await recordEvent({ type: "signup_mode_changed", userId: null, adminId: admin.id, details: { signupMode: mode, previousSignupMode: previous } }, tx);
  });
  return { ok: true, message: t.modes[mode] };
}

/** Invita a un correo a crear una cuenta (sin código: ver arriba). Uno que ya tiene cuenta no hace falta. */
export async function addSignupInvite({ email }: { email: unknown }): Promise<SignupSettingResult> {
  const admin = await requireAdmin();
  const t = TEXTS[await getRequestLocale()];
  const normalized = normalizeEmail(email);
  // 254: el largo máximo de un correo (RFC 5321), como el campo.
  if (!z.email().max(254).safeParse(normalized).success) return fail(t.email, "email");
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(sql`lower(${user.email})`, normalized));
  if (existing) return fail(t.hasAccount, "email");

  const added = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(signupInvite)
      .values({ email: normalized, invitedBy: admin.id })
      .onConflictDoNothing({ target: signupInvite.email })
      .returning({ id: signupInvite.id });
    if (!row) return false;
    await recordEvent({ type: "signup_invite_added", userId: null, adminId: admin.id, details: { email: normalized } }, tx);
    return true;
  });
  return added ? { ok: true, message: t.invited(normalized) } : fail(t.alreadyInvited, "email");
}

/** Quita la invitación de un correo (sin código: ver arriba). */
export async function removeSignupInvite({ email }: { email: unknown }): Promise<SignupSettingResult> {
  const admin = await requireAdmin();
  const t = TEXTS[await getRequestLocale()];
  const normalized = normalizeEmail(email);
  const removed = await db.transaction(async (tx) => {
    const [row] = await tx.delete(signupInvite).where(eq(signupInvite.email, normalized)).returning({ id: signupInvite.id });
    if (!row) return false;
    await recordEvent({ type: "signup_invite_removed", userId: null, adminId: admin.id, details: { email: normalized } }, tx);
    return true;
  });
  return removed ? { ok: true, message: t.removed(normalized) } : fail(t.notInvited);
}
