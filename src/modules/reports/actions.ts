"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/session";
import type { ToastTone } from "@/lib/toasts";
import { chooseFixedExpense } from "./fixed-choices";

// Las acciones de Reportes. Cada una valida la sesión antes que nada: el dueño sale de la sesión, nunca
// del formulario.

export type FixedExpenseState = { message?: string; tone?: ToastTone; error?: string };

/**
 * Agrega, quita o vuelve a poner un gasto fijo (`action`: include, exclude, restore o unadd; ver
 * src/modules/reports/fixed-choices.ts). Con éxito, vuelve a dibujar Reportes y avisa qué pasó.
 */
export async function chooseFixedExpenseAction(_prev: FixedExpenseState, formData: FormData): Promise<FixedExpenseState> {
  const user = await requireUser();
  const result = await chooseFixedExpense(user.id, { description: formData.get("description"), action: formData.get("action") });
  if (!result.ok) return { error: result.error };
  refresh();
  return { message: result.message, tone: result.tone };
}
