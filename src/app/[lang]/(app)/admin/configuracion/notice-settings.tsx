"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { NoticeBox } from "@/components/notice-banner";
import { type ToastTone, useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale, useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { FIELD_TEXTS, type FieldMessages } from "@/lib/field-errors";
import { NOTICE_MAX_DAYS, NOTICE_MAX_LENGTH, NOTICE_TONES, noticeEndBounds, toBogotaDateTime, type NoticeTone } from "@/modules/notice/notice";
import { Buttons, CODE_FIELD_TEXTS, CodeField, Dialog, FormError } from "../admin-dialog";
import { publishNoticeAction, removeNoticeAction, type NoticeState } from "./actions";

// El aviso para todos en /admin/configuracion: cómo se ve, hasta cuándo, y publicarlo, cambiarlo o quitarlo (cada
// cambio pide el código de Google Authenticator). El servidor vuelve a validar todo
// (src/modules/admin/configuracion/notice.ts). La fecha de fin va en hora de Colombia.

export type NoticeSettingsProps = {
  notice: {
    message: string;
    messageEn: string | null;
    tone: NoticeTone;
    /** "2026-10-25T20:00", para el campo de la fecha de fin (hora de Colombia). */
    endsAtInput: string;
    /** "25 de oct. de 2026, 8:00 p. m." */
    endsAtLabel: string;
    active: boolean;
    /** "Ana Admin · 22 de oct. de 2026, 6:00 p. m." */
    published: string;
  } | null;
};

const TEXTS = texts(
  {
    title: "Aviso para todos",
    intro: "Un mensaje arriba de la app, del inicio de sesión y del registro, hasta la fecha que elijas. Cada cambio pide el código de Google Authenticator.",
    none: "No hay ningún aviso.",
    tones: {
      info: { label: "Información", description: "En el color de la app: una novedad." },
      important: { label: "Importante", description: "En rojo: un mantenimiento o una falla." },
    } satisfies Record<NoticeTone, { label: string; description: string }>,
    until: (date: string) => `Se ve hasta el ${date} (hora de Colombia).`,
    expired: (date: string) => `Venció el ${date}: ya no se ve.`,
    inEnglish: "En inglés:",
    published: (who: string) => `Publicado por ${who}`,
    publish: "Publicar un aviso",
    change: "Cambiar el aviso",
    remove: "Quitar el aviso",
    publishBody: "Se ve de inmediato y se apaga solo en la fecha de fin. Quien cerró el aviso anterior ve este.",
    message: "Aviso",
    messageEn: "Aviso en inglés",
    optional: "(opcional)",
    messageEnHelp: "Con la app en inglés se ve este; si lo dejas vacío, el de arriba.",
    length: `Hasta ${NOTICE_MAX_LENGTH} caracteres, en una línea.`,
    tone: "Tipo",
    endsAt: "Hasta (hora de Colombia)",
    endsAtHelp: `Hasta ${NOTICE_MAX_DAYS} días desde hoy.`,
    submit: "Publicar",
    publishing: "Publicando…",
    removeQuestion: "¿Quitar el aviso?",
    removeBody: "Deja de verse de inmediato en la app, el inicio de sesión y el registro.",
    removeSubmit: "Quitar",
    removing: "Quitando…",
    fields: {
      message: { required: "Escribe el aviso." },
      endsAt: {
        required: "Elige la fecha y la hora de fin.",
        max: `Un aviso puede durar hasta ${NOTICE_MAX_DAYS} días.`,
        number: "Elige una fecha y hora de aquí en adelante.",
      },
    } satisfies Record<string, FieldMessages>,
  },
  {
    en: {
      title: "Notice for everyone",
      intro: "A message at the top of the app, the sign-in and the sign-up pages, until the date you choose. Each change asks for the Google Authenticator code.",
      none: "There's no notice.",
      tones: {
        info: { label: "Information", description: "In the app's color: something new." },
        important: { label: "Important", description: "In red: maintenance or an outage." },
      },
      until: (date) => `It shows until ${date} (Colombia time).`,
      expired: (date) => `It ended on ${date}: it no longer shows.`,
      inEnglish: "In English:",
      published: (who) => `Published by ${who}`,
      publish: "Publish a notice",
      change: "Change the notice",
      remove: "Remove the notice",
      publishBody: "It shows right away and turns off on its own at the end date. Whoever closed the previous notice sees this one.",
      message: "Notice",
      messageEn: "Notice in English",
      optional: "(optional)",
      messageEnHelp: "With the app in English this one shows; if you leave it empty, the one above.",
      length: `Up to ${NOTICE_MAX_LENGTH} characters, on one line.`,
      tone: "Type",
      endsAt: "Until (Colombia time)",
      endsAtHelp: `Up to ${NOTICE_MAX_DAYS} days from today.`,
      submit: "Publish",
      publishing: "Publishing…",
      removeQuestion: "Remove the notice?",
      removeBody: "It stops showing right away in the app, the sign-in and the sign-up pages.",
      removeSubmit: "Remove",
      removing: "Removing…",
      fields: {
        message: { required: "Write the notice." },
        endsAt: {
          required: "Choose the end date and time.",
          max: `A notice can last up to ${NOTICE_MAX_DAYS} days.`,
          number: "Choose a date and time from now on.",
        },
      },
    },
  },
);

export function NoticeSettings({ notice }: NoticeSettingsProps) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState<"publish" | "remove" | null>(null);
  const toast = useToast();
  // Con éxito, la ventana se cierra y el aviso emergente recibe el foco. Verde al publicar; rojo al quitar.
  const finish = (tone: ToastTone) => (message: string) => {
    setOpen(null);
    toast({ tone, message, focus: true });
  };

  return (
    <section className="card space-y-4 p-4" aria-labelledby="aviso">
      <div className="space-y-1">
        <h2 id="aviso" className="font-semibold">
          {t.title}
        </h2>
        <p className="text-sm text-muted">{t.intro}</p>
      </div>

      {notice ? (
        <div className="space-y-2 border-t border-border pt-3 text-sm">
          <NoticeBox message={notice.message} tone={notice.tone} />
          {notice.messageEn && (
            <p className="break-words text-muted">
              <span className="font-medium text-foreground">{t.inEnglish}</span> <span lang="en">{notice.messageEn}</span>
            </p>
          )}
          <p className={notice.active ? "text-muted" : "font-medium text-danger"}>
            {t.tones[notice.tone].label} · {notice.active ? t.until(notice.endsAtLabel) : t.expired(notice.endsAtLabel)}
          </p>
          <p className="text-xs text-muted">{t.published(notice.published)}</p>
        </div>
      ) : (
        <p className="border-t border-border pt-3 text-sm text-muted">{t.none}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen("publish")} className="btn-primary">
          {notice ? t.change : t.publish}
        </button>
        {notice && (
          <button
            type="button"
            onClick={() => setOpen("remove")}
            className="rounded-lg border border-danger/50 px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/10"
          >
            {t.remove}
          </button>
        )}
      </div>

      {open === "publish" && <PublishDialog notice={notice} onClose={() => setOpen(null)} onDone={finish("success")} />}
      {open === "remove" && <RemoveDialog onClose={() => setOpen(null)} onDone={finish("removal")} />}
    </section>
  );
}

type Values = { message: string; messageEn: string; tone: string; endsAt: string };

/** Mañana a la misma hora, en punto: la fecha de fin que se propone para un aviso nuevo. */
function tomorrow(now: Date) {
  const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  next.setUTCMinutes(0, 0, 0);
  return toBogotaDateTime(next);
}

function PublishDialog({ notice, onClose, onDone }: { notice: NoticeSettingsProps["notice"]; onClose: () => void; onDone: (message: string) => void }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  // React vacía el formulario al terminar la acción: lo escrito vuelve con el estado (defaultValue y
  // defaultChecked), como en los presupuestos. El código no: sirve una sola vez.
  const [state, formAction, busy] = useActionState<NoticeState & { values?: Values }, FormData>(async (prev, formData) => {
    const result = await publishNoticeAction(prev, formData);
    if (result.message) onDone(result.message);
    const value = (name: keyof Values) => String(formData.get(name) ?? "");
    return { ...result, values: { message: value("message"), messageEn: value("messageEn"), tone: value("tone"), endsAt: value("endsAt") } };
  }, {});
  const { errors, formProps } = useFieldErrors({ ...t.fields, code: FIELD_TEXTS[locale].totpCode });
  // El rango de la fecha de fin, en hora de Colombia, desde que se abre la ventana.
  const [bounds] = useState(() => {
    const now = new Date();
    const { min, max } = noticeEndBounds(now);
    return { min: toBogotaDateTime(min), max: toBogotaDateTime(max), suggested: tomorrow(now) };
  });
  const values: Values = state.values ?? {
    message: notice?.message ?? "",
    messageEn: notice?.messageEn ?? "",
    tone: notice?.tone ?? "info",
    endsAt: notice?.active ? notice.endsAtInput : bounds.suggested,
  };
  const ids = { tone: useId(), endsAt: useId(), endsAtHelp: useId() };
  const fieldError = (name: keyof Values) => errors[name] ?? (state.field === name ? state.error : undefined);
  const toneError = fieldError("tone");
  const endsAtError = fieldError("endsAt");

  return (
    <Dialog title={notice ? t.change : t.publish} onClose={onClose}>
      {(dialog) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={dialog.description} className="text-sm text-muted">
            {t.publishBody}
          </p>
          <TextField name="message" label={t.message} defaultValue={values.message} error={fieldError("message")} help={t.length} required />
          <TextField
            name="messageEn"
            label={
              <>
                {t.messageEn} <span className="font-normal text-muted">{t.optional}</span>
              </>
            }
            defaultValue={values.messageEn}
            error={fieldError("messageEn")}
            help={`${t.messageEnHelp} ${t.length}`}
            lang="en"
          />
          <fieldset aria-describedby={describedBy(toneError && ids.tone)} className="space-y-2">
            <legend className="text-sm font-medium">{t.tone}</legend>
            {NOTICE_TONES.map((tone) => (
              <label
                key={`${tone}-${values.tone}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-control p-3 transition has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
              >
                <input type="radio" name="tone" value={tone} defaultChecked={values.tone === tone} className="mt-0.5 size-4 accent-[var(--brand)]" />
                <span className="min-w-0 text-sm">
                  <span className="block font-medium">{t.tones[tone].label}</span>
                  <span className="block text-muted">{t.tones[tone].description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <FieldError id={ids.tone} message={toneError} />
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t.endsAt}</span>
              <input
                key={values.endsAt}
                name="endsAt"
                type="datetime-local"
                required
                min={bounds.min}
                max={bounds.max}
                defaultValue={values.endsAt}
                aria-invalid={Boolean(endsAtError) || undefined}
                aria-describedby={describedBy(ids.endsAtHelp, endsAtError && ids.endsAt)}
                className="input"
              />
            </label>
            <p id={ids.endsAtHelp} className="text-xs text-muted">
              {t.endsAtHelp}
            </p>
            <FieldError id={ids.endsAt} message={endsAtError} />
          </div>
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit={t.submit} pending={t.publishing} busy={busy} />
        </form>
      )}
    </Dialog>
  );
}

function TextField({
  name,
  label,
  defaultValue,
  error,
  help,
  required = false,
  lang,
}: {
  name: "message" | "messageEn";
  label: ReactNode;
  defaultValue: string;
  error?: string;
  help: string;
  required?: boolean;
  lang?: string;
}) {
  const fieldId = useId();
  const errorId = useId();
  const helpId = useId();
  // La etiqueta no envuelve el campo: el texto inicial de un textarea es contenido del DOM y, dentro del <label>,
  // pasaría a ser parte del nombre del campo ("Aviso Mantenimiento el sábado…").
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={fieldId}
        key={defaultValue}
        name={name}
        rows={3}
        required={required}
        maxLength={NOTICE_MAX_LENGTH}
        defaultValue={defaultValue}
        lang={lang}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(helpId, error && errorId)}
        className="input min-h-20 resize-y"
      />
      <p id={helpId} className="text-xs text-muted">
        {help}
      </p>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function RemoveDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const [state, formAction, busy] = useActionState<NoticeState, FormData>(async (prev, formData) => {
    const result = await removeNoticeAction(prev, formData);
    if (result.message) onDone(result.message);
    return result;
  }, {});
  const { errors, formProps } = useFieldErrors(CODE_FIELD_TEXTS[locale]);
  return (
    <Dialog title={t.removeQuestion} onClose={onClose}>
      {(dialog) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={dialog.description} className="text-sm text-muted">
            {t.removeBody}
          </p>
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit={t.removeSubmit} pending={t.removing} busy={busy} danger />
        </form>
      )}
    </Dialog>
  );
}
