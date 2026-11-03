"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale, useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { FIELD_TEXTS, type FieldMessages } from "@/lib/field-errors";
import { formatPercent } from "@/lib/money";
import { APP_VALUE_BOUNDS, type AppValueField, type AppValues } from "@/modules/app-values/values";
import { Buttons, Dialog, FormError, CodeField } from "../admin-dialog";
import { changeAppValuesAction, type AppValuesState } from "./actions";

// Los valores de la app en /admin/configuracion: los avisos de próximos pagos por defecto (los de quien no eligió los
// suyos) y los umbrales de todas las cuentas. Cambiarlos pide el código de Google Authenticator. El servidor vuelve
// a validar todo (src/modules/admin/configuracion/values.ts).

export type ValuesSettingsProps = {
  values: AppValues;
  /** "Ana Admin · 16 de oct. de 2026, 6:00 p. m.", o null si nadie los ha cambiado. */
  lastChange: string | null;
};

const { upcomingDays, budgetNearShare, recurringWindow, recurringMinMonths } = APP_VALUE_BOUNDS;
const days = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const TEXTS = texts(
  {
    title: "Valores de la app",
    intro: "Los avisos de próximos pagos de quien no eligió los suyos, y cuándo un presupuesto se acerca y un gasto es fijo, para todas las cuentas. Cada cambio pide el código de Google Authenticator.",
    upcoming: "Avisos de próximos pagos",
    upcomingValue: (enabled: boolean, n: number) =>
      enabled ? `Prendidos: ${n === 0 ? "el mismo día" : `${days(n, "día", "días")} antes`}.` : "Apagados.",
    upcomingNote: "Para quien no los cambió en su Configuración.",
    near: "Presupuestos",
    nearValue: (share: number) => `Se acercan desde el ${formatPercent(share)} (el aviso y el color del Resumen).`,
    recurring: "Gastos fijos",
    recurringValue: (min: number, window: number) => `Un egreso es fijo si aparece en al menos ${min} de los últimos ${window} meses.`,
    lastChange: (change: string) => `Último cambio: ${change}`,
    noChanges: "Sin cambios: los de siempre.",
    change: "Cambiar los valores",
    body: "Aplican de inmediato: en el Resumen, Fijos, Reportes, la campana, el bot y la Ayuda.",
    upcomingOn: "Prendidos para quien no los cambió",
    upcomingDays: "Días antes",
    upcomingDaysHelp: `De ${upcomingDays.min} (el mismo día) a ${upcomingDays.max}.`,
    nearShare: "Se acercan desde el (%)",
    nearShareHelp: `De ${budgetNearShare.min} a ${budgetNearShare.max}.`,
    minMonths: "En al menos (meses)",
    window: "De los últimos (meses)",
    recurringHelp: `Se miran de ${recurringWindow.min} a ${recurringWindow.max} meses; tiene que aparecer en ${recurringMinMonths.min} o más.`,
    save: "Guardar",
    saving: "Guardando…",
    fields: {
      upcomingDays: { required: "Escribe cuántos días antes.", number: `Escribe un número de ${upcomingDays.min} a ${upcomingDays.max}.` },
      budgetNearShare: { required: "Escribe el porcentaje.", number: `Escribe un porcentaje de ${budgetNearShare.min} a ${budgetNearShare.max}.` },
      recurringMinMonths: { required: "Escribe en cuántos meses.", number: "Escribe un número de meses, sin decimales." },
      recurringWindow: { required: "Escribe cuántos meses se miran.", number: `Escribe de ${recurringWindow.min} a ${recurringWindow.max} meses.` },
    } satisfies Record<AppValueField, FieldMessages>,
  },
  {
    en: {
      title: "App values",
      intro: "Upcoming payment notices for whoever didn't choose their own, and when a budget is getting close and an expense is a bill, for every account. Each change asks for the Google Authenticator code.",
      upcoming: "Upcoming payment notices",
      upcomingValue: (enabled, n) => (enabled ? `On: ${n === 0 ? "the same day" : `${days(n, "day", "days")} before`}.` : "Off."),
      upcomingNote: "For whoever didn't change them in their Settings.",
      near: "Budgets",
      nearValue: (share) => `Getting close from ${formatPercent(share, "en")} (the notice and the Overview color).`,
      recurring: "Bills",
      recurringValue: (min, window) => `An expense is a bill if it shows up in at least ${min} of the last ${window} months.`,
      lastChange: (change) => `Last change: ${change}`,
      noChanges: "No changes: the defaults apply.",
      change: "Change the values",
      body: "They apply right away: in the Overview, Bills, Reports, the bell, the bot and Help.",
      upcomingOn: "On for whoever didn't change them",
      upcomingDays: "Days before",
      upcomingDaysHelp: `From ${upcomingDays.min} (the same day) to ${upcomingDays.max}.`,
      nearShare: "Getting close from (%)",
      nearShareHelp: `From ${budgetNearShare.min} to ${budgetNearShare.max}.`,
      minMonths: "In at least (months)",
      window: "Of the last (months)",
      recurringHelp: `From ${recurringWindow.min} to ${recurringWindow.max} months are checked; it has to show up in ${recurringMinMonths.min} or more.`,
      save: "Save",
      saving: "Saving…",
      fields: {
        upcomingDays: { required: "Enter how many days before.", number: `Enter a number from ${upcomingDays.min} to ${upcomingDays.max}.` },
        budgetNearShare: { required: "Enter the percentage.", number: `Enter a percentage from ${budgetNearShare.min} to ${budgetNearShare.max}.` },
        recurringMinMonths: { required: "Enter in how many months.", number: "Enter a number of months, without decimals." },
        recurringWindow: { required: "Enter how many months are checked.", number: `Enter from ${recurringWindow.min} to ${recurringWindow.max} months.` },
      },
    },
  },
);

export function ValuesSettings({ values, lastChange }: ValuesSettingsProps) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <section className="card space-y-4 p-4" aria-labelledby="valores">
      <div className="space-y-1">
        <h2 id="valores" className="font-semibold">
          {t.title}
        </h2>
        <p className="text-sm text-muted">{t.intro}</p>
      </div>
      <dl className="divide-y divide-border border-t border-border text-sm">
        <Row label={t.upcoming}>
          {t.upcomingValue(values.upcomingEnabled, values.upcomingDays)} <span className="text-muted">{t.upcomingNote}</span>
        </Row>
        <Row label={t.near}>{t.nearValue(values.budgetNearShare)}</Row>
        <Row label={t.recurring}>{t.recurringValue(values.recurringMinMonths, values.recurringWindow)}</Row>
      </dl>
      <p className="text-xs text-muted">{lastChange ? t.lastChange(lastChange) : t.noChanges}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-background"
      >
        {t.change}
      </button>
      {open && (
        <ValuesDialog
          values={values}
          onClose={() => setOpen(false)}
          onDone={(message) => {
            setOpen(false);
            // La ventana se cierra: el aviso emergente recibe el foco.
            toast({ tone: "success", message, focus: true });
          }}
        />
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5 py-3">
      <dt className="font-medium">{label}</dt>
      <dd className="text-muted [&>span]:block">{children}</dd>
    </div>
  );
}

type Sent = Record<AppValueField, string> & { upcomingEnabled: boolean };

function ValuesDialog({ values, onClose, onDone }: { values: AppValues; onClose: () => void; onDone: (message: string) => void }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  // React vacía el formulario al terminar la acción: lo enviado vuelve con el estado (defaultValue y
  // defaultChecked), como en los presupuestos. El código no: sirve una sola vez.
  const [state, formAction, busy] = useActionState<AppValuesState & { sent?: Sent }, FormData>(async (prev, formData) => {
    const result = await changeAppValuesAction(prev, formData);
    if (result.message) onDone(result.message);
    const value = (name: AppValueField) => String(formData.get(name) ?? "");
    return {
      ...result,
      sent: {
        upcomingEnabled: formData.get("upcomingEnabled") === "on",
        upcomingDays: value("upcomingDays"),
        budgetNearShare: value("budgetNearShare"),
        recurringMinMonths: value("recurringMinMonths"),
        recurringWindow: value("recurringWindow"),
      },
    };
  }, {});
  const { errors, formProps } = useFieldErrors({ ...t.fields, code: FIELD_TEXTS[locale].totpCode });
  const shown: Sent = state.sent ?? {
    upcomingEnabled: values.upcomingEnabled,
    upcomingDays: String(values.upcomingDays),
    budgetNearShare: String(values.budgetNearShare),
    recurringMinMonths: String(values.recurringMinMonths),
    recurringWindow: String(values.recurringWindow),
  };
  const fieldError = (name: AppValueField) => errors[name] ?? (state.field === name ? state.error : undefined);
  const recurringHelpId = useId();

  return (
    <Dialog title={t.change} onClose={onClose}>
      {(dialog) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={dialog.description} className="text-sm text-muted">
            {t.body}
          </p>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t.upcoming}</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm pointer-fine:min-h-8">
              <input
                key={`enabled-${shown.upcomingEnabled}`}
                type="checkbox"
                name="upcomingEnabled"
                defaultChecked={shown.upcomingEnabled}
                className="size-4 accent-[var(--brand)]"
              />
              {t.upcomingOn}
            </label>
            <NumberField
              name="upcomingDays"
              label={t.upcomingDays}
              help={t.upcomingDaysHelp}
              min={upcomingDays.min}
              max={upcomingDays.max}
              defaultValue={shown.upcomingDays}
              error={fieldError("upcomingDays")}
            />
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t.near}</legend>
            <NumberField
              name="budgetNearShare"
              label={t.nearShare}
              help={t.nearShareHelp}
              min={budgetNearShare.min}
              max={budgetNearShare.max}
              defaultValue={shown.budgetNearShare}
              error={fieldError("budgetNearShare")}
            />
          </fieldset>
          <fieldset className="space-y-3" aria-describedby={recurringHelpId}>
            <legend className="text-sm font-medium">{t.recurring}</legend>
            <div className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2">
              <NumberField
                name="recurringMinMonths"
                label={t.minMonths}
                min={recurringMinMonths.min}
                max={recurringWindow.max}
                defaultValue={shown.recurringMinMonths}
                error={fieldError("recurringMinMonths")}
              />
              <NumberField
                name="recurringWindow"
                label={t.window}
                min={recurringWindow.min}
                max={recurringWindow.max}
                defaultValue={shown.recurringWindow}
                error={fieldError("recurringWindow")}
              />
            </div>
            <p id={recurringHelpId} className="text-xs text-muted">
              {t.recurringHelp}
            </p>
          </fieldset>
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit={t.save} pending={t.saving} busy={busy} />
        </form>
      )}
    </Dialog>
  );
}

function NumberField({
  name,
  label,
  help,
  min,
  max,
  defaultValue,
  error,
}: {
  name: AppValueField;
  label: string;
  help?: string;
  min: number;
  max: number;
  defaultValue: string;
  error?: string;
}) {
  const errorId = useId();
  const helpId = useId();
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        {/* En su línea: el campo es angosto y, sin eso, quedaría al lado. */}
        <span className="block text-sm font-medium">{label}</span>
        <input
          key={defaultValue}
          name={name}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          required
          defaultValue={defaultValue}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(help && helpId, error && errorId)}
          className="input w-28 tabular-nums"
        />
      </label>
      {help && (
        <p id={helpId} className="text-xs text-muted">
          {help}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
