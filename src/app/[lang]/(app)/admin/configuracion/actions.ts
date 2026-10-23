"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { publishNotice, removeNotice } from "@/modules/admin/configuracion/notice";
import { addSignupInvite, removeSignupInvite, setSignupMode } from "@/modules/admin/configuracion/signup";

// La configuración de la app desde /admin/configuracion. Cada acción valida el rol antes que nada; el código de
// Google Authenticator (para cambiar el modo de los registros y el aviso, no para las invitaciones), los datos y el
// registro en el historial se resuelven en src/modules/admin/configuracion/ (signup.ts y notice.ts).

export type SignupSettingState = { error?: string; field?: "code" | "mode" | "email"; message?: string };
export type NoticeState = { error?: string; field?: "code" | "message" | "messageEn" | "tone" | "endsAt"; message?: string };

type Result<F> = { ok: true; message: string } | { ok: false; error: string; field?: F };

/** Con éxito, vuelve a dibujar la página y avisa qué pasó. */
function settle<F>(result: Result<F>): { error?: string; field?: F; message?: string } {
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

export async function publishNoticeAction(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  await requireAdmin();
  return settle(
    await publishNotice({
      message: formData.get("message"),
      messageEn: formData.get("messageEn"),
      tone: formData.get("tone"),
      endsAt: formData.get("endsAt"),
      code: String(formData.get("code") ?? ""),
    }),
  );
}

export async function removeNoticeAction(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  await requireAdmin();
  return settle(await removeNotice({ code: String(formData.get("code") ?? "") }));
}
