"use client";

import { useActionState, useId, useState } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import type { FieldMessages } from "@/lib/field-errors";
import { saveUpcomingSettingsAction, type UpcomingSettingsState } from "@/modules/reports/actions";
import { DAYS_AHEAD_MESSAGES, MAX_DAYS_AHEAD } from "@/modules/reports/upcoming";

const TEXTS = texts(
  {
    // Los errores del campo antes de enviar (en vez del globo del navegador).
    messages: { days: { required: "Escribe cuántos días antes quieres el aviso.", number: DAYS_AHEAD_MESSAGES.es } } as Record<string, FieldMessages>,
    title: "Notificaciones",
    intro: "Los avisos de próximos pagos de tus gastos fijos, en el Resumen. Valen en todos tus dispositivos.",
    upcoming: "Avisos de próximos pagos",
    on: "Prendidos",
    off: "Apagados",
    days: "Días de anticipación",
    daysHint: "días antes de cada pago (0 = el mismo día)",
    overdue: 'Los atrasados se avisan siempre, hasta que los registres o marques "Este pago ya no aplica".',
    saving: "Guardando…",
    save: "Guardar",
  },
  {
    en: {
      messages: { days: { required: "Enter how many days before you want the notice.", number: DAYS_AHEAD_MESSAGES.en } },
      title: "Notifications",
      intro: "The upcoming payment notices for your bills, in the Overview. They apply on all your devices.",
      upcoming: "Upcoming payment notices",
      on: "On",
      off: "Off",
      days: "Days in advance",
      daysHint: "days before each payment (0 = the same day)",
      overdue: 'Overdue ones are always shown, until you add them or mark "This payment doesn\'t apply".',
      saving: "Saving…",
      save: "Save",
    },
  },
);

/**
 * Mi cuenta → Notificaciones: prender o apagar los avisos de próximos pagos del Resumen y con cuántos días de
 * anticipación (de 0, el mismo día, a MAX_DAYS_AHEAD). Se guarda con el botón y avisa abajo: verde si
 * quedan prendidos, rojo si se apagaron. Apagados, el campo de los días queda inactivo (se conservan).
 */
export function NotificationSettings({ enabled: savedEnabled, days }: { enabled: boolean; days: number }) {
  const t = useTexts(TEXTS);
  const [enabled, setEnabled] = useState(savedEnabled);
  const toast = useToast();
  const daysId = useId();
  const hintId = useId();
  const errorId = useId();
  const { errors, formProps } = useFieldErrors(t.messages);
  const [state, formAction, busy] = useActionState<UpcomingSettingsState, FormData>(async (prev, formData) => {
    const result = await saveUpcomingSettingsAction(prev, formData);
    if (result.message && result.tone) toast({ tone: result.tone, message: result.message });
    return result;
  }, {});
  // El del navegador (antes de enviar) o el del servidor (siempre de los días).
  const error = errors.days ?? state.error;

  return (
    <section className="card space-y-3 p-4 text-sm" aria-labelledby="notificaciones">
      <div className="space-y-1">
        {/* "Notificaciones" y no "Avisos": así se llama la zona de los avisos emergentes (src/components/toaster.tsx). */}
        <h2 id="notificaciones" className="font-semibold">
          {t.title}
        </h2>
        <p className="text-muted">{t.intro}</p>
      </div>
      <form action={formAction} {...formProps} className="space-y-3">
        {/* Un checkbox con forma de interruptor: el lector de pantalla lo lee como tal (role="switch"). Con
            el teclado, el foco se ve en toda la fila (como en el selector de Apariencia). */}
        <div className="border-t border-border pt-3">
          <label className="-mx-2 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40">
            <span>
              <span className="block font-medium">{t.upcoming}</span>
              <span className="block text-xs text-muted">{enabled ? t.on : t.off}</span>
            </span>
            {/* El checkbox de verdad, transparente, encima del dibujo del interruptor: recibe el toque y el foco. */}
            <span className="relative inline-flex shrink-0">
              <input
                type="checkbox"
                role="switch"
                name="enabled"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
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
              min={0}
              max={MAX_DAYS_AHEAD}
              step={1}
              required
              defaultValue={days}
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
        <p className="text-xs text-muted">{t.overdue}</p>
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn-primary min-h-11 pointer-fine:min-h-9">
            {busy ? t.saving : t.save}
          </button>
        </div>
      </form>
    </section>
  );
}
