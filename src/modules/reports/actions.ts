"use server";

import { refresh } from "next/cache";
import { getRequestLocale } from "@/i18n/request";
import { todayInTimezone } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import type { ToastTone } from "@/lib/toasts";
import { chooseFixedExpense } from "./fixed-choices";
import { saveFixedNote } from "./history-notes";
import { registerFixedPayment } from "./fixed-payments";
import { skipFixedPayment } from "./payment-skips";
import { saveUpcomingSettings } from "./upcoming-settings";

// Las acciones de los gastos fijos (la pestaña Fijos, /gastos-fijos, y los avisos de próximos pagos del
// Resumen y de Mi cuenta). Cada una valida la sesión antes que nada: el dueño sale de la sesión, nunca del
// formulario.

export type FixedExpenseState = { message?: string; tone?: ToastTone; error?: string };

/**
 * Agrega, quita o vuelve a poner un gasto fijo (`action`: include, exclude, restore o unadd; ver
 * src/modules/reports/fixed-choices.ts). Con éxito, vuelve a dibujar Reportes y avisa qué pasó.
 */
export async function chooseFixedExpenseAction(_prev: FixedExpenseState, formData: FormData): Promise<FixedExpenseState> {
  const user = await requireUser();
  const result = await chooseFixedExpense(user.id, { description: formData.get("description"), action: formData.get("action") }, await getRequestLocale());
  if (!result.ok) return { error: result.error };
  refresh();
  return { message: result.message, tone: result.tone };
}

export type FixedNoteState = { message?: string; tone?: ToastTone; error?: string; field?: "note" };

/**
 * Guarda la nota de un cambio del historial de un gasto fijo (o la borra, si llega vacía; ver
 * src/modules/reports/history-notes.ts). Con éxito, vuelve a dibujar Reportes y avisa.
 */
export async function saveFixedNoteAction(_prev: FixedNoteState, formData: FormData): Promise<FixedNoteState> {
  const user = await requireUser();
  const result = await saveFixedNote(
    user.id,
    { description: formData.get("description"), month: formData.get("month"), note: formData.get("note") },
    await getRequestLocale(),
  );
  if (!result.ok) return { error: result.error, field: result.field };
  refresh();
  return { message: result.message, tone: result.tone };
}


export type PaymentSkipState = { message?: string; tone?: ToastTone; error?: string };

/**
 * "Este pago ya no aplica" en un aviso de próximos pagos: oculta el de ese mes de ese gasto fijo (ver
 * src/modules/reports/payment-skips.ts). Con éxito, vuelve a dibujar el Resumen y avisa.
 */
export async function skipFixedPaymentAction(_prev: PaymentSkipState, formData: FormData): Promise<PaymentSkipState> {
  const user = await requireUser();
  const result = await skipFixedPayment(user.id, { description: formData.get("description"), month: formData.get("month") }, await getRequestLocale());
  if (!result.ok) return { error: result.error };
  refresh();
  return { message: result.message, tone: result.tone };
}

export type UpcomingSettingsState = { message?: string; tone?: ToastTone; error?: string; field?: "days" };

/**
 * Mi cuenta → Notificaciones: prende o apaga los avisos de próximos pagos y guarda con cuántos días de anticipación
 * (ver src/modules/reports/upcoming-settings.ts). Con éxito, vuelve a dibujar la página y avisa.
 */
export async function saveUpcomingSettingsAction(_prev: UpcomingSettingsState, formData: FormData): Promise<UpcomingSettingsState> {
  const user = await requireUser();
  const result = await saveUpcomingSettings(user.id, { enabled: formData.get("enabled"), days: formData.get("days") }, await getRequestLocale());
  if (!result.ok) return { error: result.error, field: result.field };
  refresh();
  return { message: result.message, tone: result.tone };
}

export type RegisterPaymentState = { message?: string; tone?: ToastTone; error?: string; field?: "amount" | "occurredOn" };

/**
 * "Registrar pago" en un aviso de próximos pagos: registra el pago de ese gasto fijo con el monto y la
 * fecha que confirmó la persona, y la descripción y la categoría de su último pago (ver
 * src/modules/reports/fixed-payments.ts). Con éxito, vuelve a dibujar el Resumen y avisa.
 */
export async function registerFixedPaymentAction(_prev: RegisterPaymentState, formData: FormData): Promise<RegisterPaymentState> {
  const user = await requireUser();
  const result = await registerFixedPayment(
    user,
    { description: formData.get("description"), amount: formData.get("amount"), occurredOn: formData.get("occurredOn") },
    todayInTimezone(user.timezone),
    await getRequestLocale(),
  );
  if (!result.ok) return { error: result.error, field: result.field };
  refresh();
  return { message: result.message, tone: result.tone };
}
