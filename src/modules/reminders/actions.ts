"use server";

import { refresh } from "next/cache";
import { getRequestLocale } from "@/i18n/request";
import { requireUser } from "@/lib/session";
import type { ToastTone } from "@/lib/toasts";
import { saveReminderSettings } from "./reminders";

// Configuración → Recordatorio de registro. Valida la sesión antes que nada: el dueño sale de la sesión, nunca del
// formulario.

export type ReminderSettingsState = { message?: string; tone?: ToastTone; error?: string; field?: "days" };

export async function saveReminderSettingsAction(_prev: ReminderSettingsState, formData: FormData): Promise<ReminderSettingsState> {
  const user = await requireUser();
  const result = await saveReminderSettings(user.id, { enabled: formData.get("enabled"), days: formData.get("days") }, await getRequestLocale());
  if (!result.ok) return { error: result.error, field: result.field };
  refresh();
  return { message: result.message, tone: result.tone };
}
