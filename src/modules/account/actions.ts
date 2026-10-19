"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ACCOUNT_LOCKED } from "@/lib/auth-errors";
import { hasRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { confirmAdminCode } from "@/modules/admin/shared/confirm-code";
import { normalizeEmail, releaseAttempt, reserveAttempt } from "@/modules/auth/lockout";
import { CONFIRMATION_WORD } from "./confirmation";
import { deleteAccountData } from "./delete-account";
import { recordEvent } from "./events";
import { checkPasswordChange, type PasswordChangeField } from "./password-change";

export type DeleteAccountState = {
  error?: string;
  fieldErrors?: Partial<Record<"password" | "confirmation", string>>;
};

/**
 * Elimina la cuenta de quien tiene la sesión y todos sus datos. Pide la contraseña (aunque haya
 * sesión: alguien podría usar un celular desbloqueado ajeno) y escribir la palabra de
 * confirmación. Las contraseñas equivocadas cuentan para el bloqueo por intentos fallidos.
 */
export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();

  const fieldErrors: DeleteAccountState["fieldErrors"] = {};
  if (!password) fieldErrors.password = "Escribe tu contraseña";
  if (confirmation !== CONFIRMATION_WORD) {
    fieldErrors.confirmation = `Escribe ${CONFIRMATION_WORD} para confirmar`;
  }
  if (fieldErrors.password || fieldErrors.confirmation) return { fieldErrors };

  // El intento se reserva antes de verificar (como en el login): si la contraseña es equivocada,
  // queda como fallo; si no, se devuelve.
  const email = normalizeEmail(user.email);
  if (!(await reserveAttempt(email)).ok) return { error: ACCOUNT_LOCKED };

  const requestHeaders = await headers();
  try {
    await auth.api.verifyPassword({ body: { password }, headers: requestHeaders });
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") {
      return { fieldErrors: { password: "Contraseña incorrecta" } };
    }
    await releaseAttempt(email);
    if (!isAPIError(error)) throw error;
    return { error: "No pudimos verificar tu contraseña. Cierra sesión y vuelve a entrar." };
  }
  await releaseAttempt(email);

  // Primero se cierra la sesión (borra la cookie) y después se borra todo.
  await auth.api.signOut({ headers: requestHeaders });
  await deleteAccountData(user.id);
  redirect("/cuenta-eliminada");
}

export type ChangePasswordState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<PasswordChangeField, string>>;
};

/**
 * Cambia la contraseña de quien tiene la sesión (Mi cuenta). Pide la actual; los admins con la
 * verificación en dos pasos, también su código de Google Authenticator. Las contraseñas equivocadas
 * cuentan para el bloqueo por intentos fallidos, como en el login. Al cambiarla se cierran las otras
 * sesiones (esta sigue abierta) y queda en el historial.
 */
export async function changePasswordAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const repeat = String(formData.get("repeat") ?? "");
  const fieldErrors = checkPasswordChange({ current, next, repeat });
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  // El intento se reserva antes de verificar (como en el login): si la contraseña es equivocada,
  // queda como fallo; si no, se devuelve.
  const email = normalizeEmail(user.email);
  if (!(await reserveAttempt(email)).ok) return { error: ACCOUNT_LOCKED };
  const requestHeaders = await headers();
  try {
    await auth.api.verifyPassword({ body: { password: current }, headers: requestHeaders });
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") {
      return { fieldErrors: { current: "Contraseña incorrecta." } };
    }
    await releaseAttempt(email);
    if (!isAPIError(error)) throw error;
    return { error: "No pudimos verificar tu contraseña. Cierra sesión y vuelve a entrar." };
  }
  await releaseAttempt(email);

  // Un admin con la verificación activa confirma con su código (límite de intentos, un solo uso).
  if (hasRole(user.role, "admin") && user.twoFactorEnabled) {
    const check = await confirmAdminCode(String(formData.get("code") ?? ""));
    if (!check.ok) return { fieldErrors: { code: check.error } };
  }

  // Cambia la contraseña y cierra las demás sesiones, dejando esta. (Con revokeOtherSessions, Better
  // Auth cierra todas y abre una nueva, pero desde una Server Action su cookie no llega: se cerraba
  // también esta.)
  await auth.api.changePassword({ body: { currentPassword: current, newPassword: next }, headers: requestHeaders });
  await auth.api.revokeOtherSessions({ headers: requestHeaders });
  await recordEvent({ type: "password_changed", userId: user.id });
  return { ok: true };
}
