"use client";

import { useActionState, useId, useState } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import type { FieldMessages } from "@/lib/field-errors";
import { type ReminderSettingsState, saveReminderSettingsAction } from "@/modules/reminders/actions";
import { REMINDER_DAYS_MAX, REMINDER_DAYS_MESSAGES, REMINDER_DAYS_MIN } from "@/modules/reminders/register-reminder";

const TEXTS = texts(
  {
    // Los errores del campo antes de enviar (en vez del globo del navegador).
    messages: { days: { required: "Escribe después de cuántos días quieres el recordatorio.", number: REMINDER_DAYS_MESSAGES.es } } as Record<string, FieldMessages>,
    title: "Recordatorio de registro",
    intro: "Si pasan unos días sin que registres nada, te lo recordamos en el Resumen y en la campana, para que tus cuentas del mes queden completas.",
    reminder: "Recordatorio",
    on: "Prendido",
    off: "Apagado",
    days: "Días sin registrar",
    daysHint: `días (de ${REMINDER_DAYS_MIN} a ${REMINDER_DAYS_MAX})`,
    saving: "Guardando…",
    save: "Guardar",
  },
  {
    en: {
      messages: { days: { required: "Enter after how many days you want the reminder.", number: REMINDER_DAYS_MESSAGES.en } },
      title: "Reminder to add transactions",
      intro: "If a few days go by without you adding anything, we remind you in the Overview and in the bell, so your month's numbers stay complete.",
      reminder: "Reminder",
      on: "On",
      off: "Off",
      days: "Days without adding",
      daysHint: `days (from ${REMINDER_DAYS_MIN} to ${REMINDER_DAYS_MAX})`,
      saving: "Saving…",
      save: "Save",
    },
  },
);

/**
 * Configuración → Recordatorio de registro: prenderlo o apagarlo y después de cuántos días sin registrar nada (de
 * REMINDER_DAYS_MIN a REMINDER_DAYS_MAX). Funciona como Notificaciones: se guarda con el botón y avisa abajo, verde
 * si queda prendido y rojo si se apagó; apagado, el campo de los días queda inactivo (se conservan).
 */
export function ReminderSettings({ enabled: savedEnabled, days }: { enabled: boolean; days: number }) {
  const t = useTexts(TEXTS);
  const toast = useToast();
  const daysId = useId();
  const hintId = useId();
  const errorId = useId();
  const { errors, formProps } = useFieldErrors(t.messages);
  // Como en Notificaciones: React vacía el formulario al terminar la acción, así que lo enviado vuelve con el
  // estado y los campos lo usan de valor inicial.
  const [state, formAction, busy] = useActionState<ReminderSettingsState & { enabled?: boolean; days?: string }, FormData>(async (prev, formData) => {
    const result = await saveReminderSettingsAction(prev, formData);
    if (result.message && result.tone) toast({ tone: result.tone, message: result.message });
    const sentDays = formData.get("days");
    return { ...result, enabled: formData.get("enabled") === "on", days: typeof sentDays === "string" ? sentDays : undefined };
  }, {});
  const [touched, setTouched] = useState<{ since: typeof state; enabled: boolean }>();
  const enabled = touched?.since === state ? touched.enabled : (state.enabled ?? savedEnabled);
  const error = errors.days ?? state.error;

  return (
    <section className="card scroll-mt-4 space-y-3 p-4 text-sm" aria-labelledby="recordatorio">
      <div className="space-y-1">
        <h2 id="recordatorio" className="font-semibold">
          {t.title}
        </h2>
        <p className="text-muted">{t.intro}</p>
      </div>
      <form action={formAction} {...formProps} className="space-y-3">
        <div className="border-t border-border pt-3">
          <label className="-mx-2 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40">
            <span>
              <span className="block font-medium">{t.reminder}</span>
              <span className="block text-xs text-muted">{enabled ? t.on : t.off}</span>
            </span>
            <span className="relative inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                name="enabled"
                defaultChecked={state.enabled ?? savedEnabled}
                onChange={(event) => setTouched({ since: state, enabled: event.target.checked })}
                className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
              />
              <span
                aria-hidden
                className="relative inline-flex h-6 w-11 rounded-full bg-control transition peer-checked:bg-brand after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-surface after:transition peer-checked:after:translate-x-5"
              />
            </span>
          </label>
        </div>
        <div className="space-y-1.5 border-t border-border pt-3">
          <label htmlFor={daysId} className="block font-medium">
            {t.days}
          </label>
          <div className="flex items-center gap-2">
            <input
              id={daysId}
              name="days"
              type="number"
              inputMode="numeric"
              min={REMINDER_DAYS_MIN}
              max={REMINDER_DAYS_MAX}
              step={1}
              required
              defaultValue={state.days ?? days}
              disabled={!enabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy(hintId, error && errorId)}
              className="input w-24 tabular-nums disabled:opacity-60"
            />
            <span id={hintId} className="text-muted">
              {t.daysHint}
            </span>
          </div>
          <FieldError id={errorId} message={error} />
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn-primary min-h-11 pointer-fine:min-h-9">
            {busy ? t.saving : t.save}
          </button>
        </div>
      </form>
    </section>
  );
}
