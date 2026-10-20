"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/session";
import type { ToastTone } from "@/lib/toasts";
import { markNotificationsRead } from "./reads";

// Las acciones de la campana. Cada una valida la sesión antes que nada: el dueño sale de la sesión, nunca
// del formulario.

export type MarkReadState = { message?: string; tone?: ToastTone; error?: string };

/**
 * "Marcar como leído" (un `id`) o "Marcar todas como leídas" (varios `id`): salen de la campana; los avisos
 * siguen en el Resumen. Con éxito, vuelve a dibujar la página (y la campana) y avisa.
 */
export async function markNotificationsReadAction(_prev: MarkReadState, formData: FormData): Promise<MarkReadState> {
  const user = await requireUser();
  const result = await markNotificationsRead(user.id, formData.getAll("id"));
  if (!result.ok) return { error: result.error };
  refresh();
  return { message: result.message, tone: result.tone };
}
