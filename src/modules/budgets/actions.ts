"use server";

import { refresh } from "next/cache";
import { getRequestLocale } from "@/i18n/request";
import { requireUser } from "@/lib/session";
import type { ToastTone } from "@/lib/toasts";
import { removeBudget, saveBudget } from "./budgets";

// Las acciones de /presupuestos. Cada una valida la sesión antes que nada: el dueño sale de la sesión, nunca del
// formulario.

export type BudgetState = { message?: string; tone?: ToastTone; error?: string; field?: "categoryId" | "amount" };

/** Pone o cambia el presupuesto de una categoría (ver src/modules/budgets/budgets.ts). Con éxito, vuelve a dibujar y avisa. */
export async function saveBudgetAction(_prev: BudgetState, formData: FormData): Promise<BudgetState> {
  const user = await requireUser();
  const result = await saveBudget(user, { categoryId: formData.get("categoryId"), amount: formData.get("amount") }, await getRequestLocale());
  if (!result.ok) return { error: result.error, field: result.field };
  refresh();
  return { message: result.message, tone: result.tone };
}

/** Quita el presupuesto de una categoría. Con éxito, vuelve a dibujar y avisa. */
export async function removeBudgetAction(_prev: BudgetState, formData: FormData): Promise<BudgetState> {
  const user = await requireUser();
  const result = await removeBudget(user.id, { categoryId: formData.get("categoryId") }, await getRequestLocale());
  if (!result.ok) return { error: result.error };
  refresh();
  return { message: result.message, tone: result.tone };
}
