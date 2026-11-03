"use client";

import { useActionState, useState } from "react";
import { useToast } from "@/components/toaster";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { type GmfSettingState, saveGmfSettingAction } from "@/modules/transactions/actions";

const TEXTS = texts(
  {
    title: "4x1000",
    intro:
      "El impuesto del 0,4 % a los movimientos de tu banco. Prendido, al registrar un egreso puedes aplicarlo y el bot te pregunta si lo registras. Si no te lo cobran (por ejemplo, porque tu cuenta está exenta), apágalo.",
    charge: "Cobro del 4x1000",
    on: "Prendido",
    off: "Apagado",
    saving: "Guardando…",
    save: "Guardar",
  },
  {
    en: {
      title: "4x1000",
      intro:
        "Colombia's 0.4% tax on bank transactions. When it's on, you can apply it when you add an expense and the bot asks whether to add it. If you aren't charged it (for example, because your account is exempt), turn it off.",
      charge: "4x1000 charge",
      on: "On",
      off: "Off",
      saving: "Saving…",
      save: "Save",
    },
  },
);

/**
 * Configuración → 4x1000 (src/modules/transactions/gmf.ts): prendido, el formulario de egresos ofrece "Aplicar
 * 4x1000" y el bot lo pregunta; apagado, ninguno de los dos. Como el recordatorio: se guarda con el botón y avisa
 * abajo, verde si queda prendido y rojo si se apagó.
 */
export function GmfSettings({ enabled: savedEnabled }: { enabled: boolean }) {
  const t = useTexts(TEXTS);
  const toast = useToast();
  // React vacía el formulario al terminar la acción: lo enviado vuelve con el estado y el interruptor lo usa.
  const [state, formAction, busy] = useActionState<GmfSettingState & { enabled?: boolean }, FormData>(async (prev, formData) => {
    const result = await saveGmfSettingAction(prev, formData);
    if (result.message && result.tone) toast({ tone: result.tone, message: result.message });
    return { ...result, enabled: formData.get("enabled") === "on" };
  }, {});
  const [touched, setTouched] = useState<{ since: typeof state; enabled: boolean }>();
  const enabled = touched?.since === state ? touched.enabled : (state.enabled ?? savedEnabled);

  return (
    <section className="card scroll-mt-4 space-y-3 p-4 text-sm" aria-labelledby="impuestos">
      <div className="space-y-1">
        <h2 id="impuestos" className="font-semibold">
          {t.title}
        </h2>
        <p className="text-muted">{t.intro}</p>
      </div>
      <form action={formAction} className="space-y-3">
        <div className="border-t border-border pt-3">
          <label className="-mx-2 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40">
            <span>
              <span className="block font-medium">{t.charge}</span>
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
        <div className="flex justify-end">
          <button type="submit" disabled={busy} className="btn-primary min-h-11 pointer-fine:min-h-9">
            {busy ? t.saving : t.save}
          </button>
        </div>
      </form>
    </section>
  );
}
