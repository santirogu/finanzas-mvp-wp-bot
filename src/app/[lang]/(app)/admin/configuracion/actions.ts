"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { addSignupInvite, removeSignupInvite, setSignupMode, type SignupSettingResult } from "@/modules/admin/configuracion/signup";

// La configuración de la app desde /admin/configuracion. Cada acción valida el rol antes que nada; el código de
// Google Authenticator (solo para cambiar el modo), los datos y el registro en el historial se resuelven en
// src/modules/admin/configuracion/signup.ts.

export type SignupSettingState = { error?: string; field?: "code" | "mode" | "email"; message?: string };

/** Con éxito, vuelve a dibujar la página y avisa qué pasó. */
function settle(result: SignupSettingResult): SignupSettingState {
  if (!result.ok) return { error: result.error, field: result.field };
  refresh();
  return { message: result.message };
}

export async function changeSignupModeAction(_prev: SignupSettingState, formData: FormData): Promise<SignupSettingState> {
  await requireAdmin();
  return settle(await setSignupMode({ mode: formData.get("mode"), code: String(formData.get("code") ?? "") }));
}

export async function addSignupInviteAction(_prev: SignupSettingState, formData: FormData): Promise<SignupSettingState> {
  await requireAdmin();
  return settle(await addSignupInvite({ email: formData.get("email") }));
}

export async function removeSignupInviteAction(_prev: SignupSettingState, formData: FormData): Promise<SignupSettingState> {
  await requireAdmin();
  return settle(await removeSignupInvite({ email: formData.get("email") }));
}
