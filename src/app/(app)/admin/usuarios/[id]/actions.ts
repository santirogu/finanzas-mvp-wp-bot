"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { TOAST_PARAM } from "@/lib/toasts";
import {
  deleteAccount,
  reactivateAccount,
  revokeSessions,
  suspendAccount,
  unlinkWhatsApp,
  unlockLogin,
  type AdminActionInput,
  type AdminActionResult,
} from "@/modules/admin/users/account-actions";
import { USERS_PATH } from "@/modules/admin/users/user-filters";

// Las acciones del admin sobre una cuenta. Cada una valida el rol antes que nada; la cuenta, el
// código de Google Authenticator y el registro en el historial se resuelven en
// src/modules/admin/users/account-actions.ts.

export type AccountActionState = { error?: string; field?: "code" | "email"; message?: string };

const readInput = (formData: FormData): AdminActionInput => ({
  userId: String(formData.get("userId") ?? ""),
  code: String(formData.get("code") ?? ""),
});

/** Con éxito, vuelve a dibujar la página (la acción ya no aparece si no aplica) y avisa qué pasó. */
function settle(result: AdminActionResult): AccountActionState {
  if (!result.ok) return { error: result.error, field: result.field };
  refresh();
  return { message: result.message };
}

export async function unlockLoginAction(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  await requireAdmin();
  return settle(await unlockLogin(readInput(formData)));
}

export async function revokeSessionsAction(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  await requireAdmin();
  return settle(await revokeSessions(readInput(formData)));
}

export async function unlinkWhatsAppByAdminAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await requireAdmin();
  return settle(await unlinkWhatsApp(readInput(formData)));
}

export async function suspendAccountAction(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  await requireAdmin();
  return settle(await suspendAccount({ ...readInput(formData), reason: String(formData.get("reason") ?? "") }));
}

export async function reactivateAccountAction(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  await requireAdmin();
  return settle(await reactivateAccount(readInput(formData)));
}

export async function deleteAccountByAdminAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await requireAdmin();
  const result = await deleteAccount({ ...readInput(formData), email: String(formData.get("email") ?? "") });
  if (!result.ok) return { error: result.error, field: result.field };
  // La cuenta ya no existe: de vuelta a la lista, con el aviso.
  // La lista muestra el aviso "Se eliminó la cuenta" (?aviso=, src/lib/toasts.ts).
  redirect(`${USERS_PATH}?${TOAST_PARAM}=cuenta-eliminada`);
}
