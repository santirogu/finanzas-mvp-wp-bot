"use client";

import { useActionState, useId, useState } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import type { FieldMessages } from "@/lib/field-errors";
import { saveUpcomingSettingsAction, type UpcomingSettingsState } from "@/modules/reports/actions";
import { DAYS_AHEAD_MESSAGE, MAX_DAYS_AHEAD } from "@/modules/reports/upcoming";

// Los errores del campo antes de enviar, en español (en vez del globo del navegador).
const MESSAGES: Record<string, FieldMessages> = {
  days: { required: "Escribe cuántos días antes quieres el aviso.", number: DAYS_AHEAD_MESSAGE },
};

/**
 * Mi cuenta → Notificaciones: prender o apagar los avisos de próximos pagos del Resumen y con cuántos días de
 * anticipación (de 0, el mismo día, a MAX_DAYS_AHEAD). Se guarda con el botón y avisa abajo: verde si
 * quedan prendidos, rojo si se apagaron. Apagados, el campo de los días queda inactivo (se conservan).
 */
export function NotificationSettings({ enabled: savedEnabled, days }: { enabled: boolean; days: number }) {
  const [enabled, setEnabled] = useState(savedEnabled);
  const toast = useToast();
  const daysId = useId();
  const hintId = useId();
  const errorId = useId();
  const { errors, formProps } = useFieldErrors(MESSAGES);
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
          Notificaciones
        </h2>
        <p className="text-muted">Los avisos de próximos pagos de tus gastos fijos, en el Resumen. Valen en todos tus dispositivos.</p>
      </div>
      <form action={formAction} {...formProps} className="space-y-3">
        {/* Un checkbox con forma de interruptor: el lector de pantalla lo lee como tal (role="switch"). Con
            el teclado, el foco se ve en toda la fila (como en el selector de Apariencia). */}
        <div className="border-t border-border pt-3">
          <label className="-mx-2 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40">
            <span>
              <span className="block font-medium">Avisos de próximos pagos</span>
              <span className="block text-xs text-muted">{enabled ? "Prendidos" : "Apagados"}</span>
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
            Días de anticipación
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
              días antes de cada pago (0 = el mismo día)
            </span>
          </div>
          <FieldError id={errorId} message={error} />
        </div>
        <p className="text-xs text-muted">Los atrasados se avisan siempre, hasta que los registres o marques &quot;Este pago ya no aplica&quot;.</p>
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn-primary min-h-11 pointer-fine:min-h-9">
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </section>
  );
}
