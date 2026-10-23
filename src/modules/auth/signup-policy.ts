import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { appSetting, signupInvite } from "@/db/schema";
import { normalizeEmail } from "./lockout";
import { DEFAULT_SIGNUP_MODE, isSignupMode, type SignupMode } from "./signup-modes";

// Si se puede crear una cuenta (el hook de registro de Better Auth, src/lib/auth.ts, y la página /registro). No
// pide sesión: lo consulta quien todavía no tiene cuenta. Lo que cambia el modo y las invitaciones es del admin
// (src/modules/admin/configuracion/).

/** Cómo están los registros: lo que eligió el admin o, sin elegir, abiertos. */
export async function getSignupMode(): Promise<SignupMode> {
  const [row] = await db.select({ mode: appSetting.signupMode }).from(appSetting).where(eq(appSetting.id, 1));
  return isSignupMode(row?.mode) ? row.mode : DEFAULT_SIGNUP_MODE;
}

export type SignupCheck = { ok: true } | { ok: false; reason: "closed" | "not_invited" };

/**
 * ¿Puede crear una cuenta con ese correo? Con los registros abiertos, sí; cerrados, no; solo con invitación, si el
 * correo (sin mayúsculas ni espacios) está invitado. Una invitación ya usada no sirve para otra cuenta: el correo
 * ya tiene una (Better Auth no deja repetirlo).
 */
export async function checkSignup(email: unknown): Promise<SignupCheck> {
  const mode = await getSignupMode();
  if (mode === "open") return { ok: true };
  if (mode === "closed") return { ok: false, reason: "closed" };
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, reason: "not_invited" };
  const [invite] = await db.select({ id: signupInvite.id }).from(signupInvite).where(eq(signupInvite.email, normalized));
  return invite ? { ok: true } : { ok: false, reason: "not_invited" };
}

/** Marca como usada la invitación de ese correo, si había una (al crearse la cuenta). */
export async function markInviteUsed(email: string, now = new Date()): Promise<void> {
  await db
    .update(signupInvite)
    .set({ usedAt: now })
    .where(and(eq(signupInvite.email, normalizeEmail(email)), isNull(signupInvite.usedAt)));
}
