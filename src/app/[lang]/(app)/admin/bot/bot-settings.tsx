"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale } from "@/i18n/client";
import { INTL_LOCALES, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { FIELD_TEXTS, type FieldMessages } from "@/lib/field-errors";
import { AI_LIMIT_BOUNDS, MONTHLY_TOKEN_BOUNDS, type AiLimits } from "@/modules/bot/limits";
import { type ToastTone, useToast } from "@/components/toaster";
import { Buttons, CODE_FIELD_TEXTS, CodeField, Dialog, FormError } from "../admin-dialog";
import {
  changeAiLimitsAction,
  changeMonthlyLimitAction,
  pauseClaudeAction,
  resumeClaudeAction,
  type BotSettingState,
} from "./actions";

// La configuración del bot en /admin/bot: si Claude está activo o en pausa, los topes de mensajes con
// Claude por cuenta y el tope mensual de tokens. Cada cambio abre una ventana que explica qué va a pasar y pide el código de
// Google Authenticator. El servidor vuelve a validar todo (src/modules/admin/bot/bot-settings.ts). En el
// idioma de la página: los miles se escriben con su separador ("1.000" o "1,000"), como los lee el servidor.

type Kind = "pause" | "resume" | "limits" | "monthly";
type ServerAction = (prev: BotSettingState, formData: FormData) => Promise<BotSettingState>;

export type BotSettingsProps = {
  claudePaused: boolean;
  limits: AiLimits;
  monthlyTokenLimit: number | null;
  /** Lo que va del mes: tokens usados, si se llegó al tope y cuándo vuelve ("1 de noviembre", "November 1"). */
  month: { used: number; reached: boolean; resetsOn: string };
  /** Tokens por llamada, en promedio (para estimar cuánto alcanza un tope); null sin llamadas. */
  averageTokensPerCall: number | null;
  /** "Ana Admin · 16 de oct de 2026, 6:00 p. m.", o null si nadie la ha cambiado. */
  lastChange: string | null;
};

/** Qué parte del tope va usada, sin decimales ("<1" si es casi nada). */
const share = (used: number, limit: number) => {
  const pct = Math.floor((used / limit) * 100);
  return used > 0 && pct === 0 ? "<1" : String(pct);
};

// Los comandos (balance, reporte, deshacer, ayuda) van como se escriben en el bot, que responde en español.
const TEXTS = texts(
  {
    title: "Configuración",
    intro: "Aplica desde el siguiente mensaje. Cada cambio pide el código de Google Authenticator.",
    paused: "En pausa: el bot solo responde balance, reporte, deshacer y ayuda.",
    monthlyPaused: (date: string) => `En pausa por el tope mensual hasta el ${date}: el bot solo responde balance, reporte, deshacer y ayuda.`,
    active: "Activo: entiende los mensajes escritos libremente.",
    resume: "Reanudar Claude",
    pause: "Pausar Claude",
    limitsTitle: "Topes por cuenta",
    limits: (perHour: string, perDay: string) => `${perHour} por hora y ${perDay} por día`,
    limitsDescription: (limits: string) => `${limits}, de mensajes con Claude.`,
    change: "Cambiar",
    changeLimits: "Cambiar los topes por cuenta",
    monthlyTitle: "Tope mensual de tokens",
    noMonthly: (used: string) => `Sin tope. Este mes van ${used} tokens.`,
    reached: (used: string, limit: string, date: string) => `Alcanzado: ${used} de ${limit}. Claude vuelve el ${date}.`,
    monthly: (limit: string, used: string, share: string) => `${limit} al mes, de todas las cuentas. Este mes van ${used} (${share} %).`,
    changeMonthly: "Cambiar el tope mensual de tokens",
    lastChange: (change: string) => `Último cambio: ${change}`,
    noChanges: "Sin cambios: valen los de siempre.",
    pauseQuestion: "¿Pausar Claude?",
    pauseSubmit: "Pausar",
    pausing: "Pausando…",
    pauseBody:
      "El bot deja de llamar a Claude: a lo escrito libremente responde que lo registren en la web, y balance, reporte, deshacer y ayuda siguen funcionando. Mientras esté en pausa no gasta créditos de Anthropic.",
    resumeQuestion: "¿Reanudar Claude?",
    resumeSubmit: "Reanudar",
    resuming: "Reanudando…",
    resumeBody: "El bot vuelve a entender los mensajes escritos libremente. Cada uno usa una llamada a Claude, dentro de los topes de cada cuenta.",
    limitsBody: (perHour: string, perDay: string) =>
      `Cuántos mensajes escritos libremente puede interpretar Claude para cada cuenta. Al llegar al tope, el bot le pide esperar; los comandos siguen. Hasta ${perHour} por hora y ${perDay} por día.`,
    perHour: "Por hora",
    perDay: "Por día",
    saveLimits: "Guardar topes",
    saving: "Guardando…",
    monthlyBody:
      "Cuántos tokens de Claude se pueden usar al mes, entre todas las cuentas. Al llegar, el bot deja de usar Claude hasta el mes siguiente (los comandos siguen). Vacío: sin tope.",
    tokensPerMonth: "Tokens al mes",
    noLimit: "Sin tope",
    range: (min: string, max: string) => `Entre ${min} y ${max}.`,
    average: (tokens: string) => ` En promedio, cada mensaje usa ${tokens} tokens`,
    estimate: (messages: string) => `: alcanza para unos ${messages} mensajes.`,
    saveMonthly: "Guardar tope",
    fields: {
      perHour: { required: "Escribe cuántos mensajes por hora.", pattern: "Escribe un número entero, sin decimales." },
      perDay: { required: "Escribe cuántos mensajes por día.", pattern: "Escribe un número entero, sin decimales." },
      monthlyLimit: { pattern: "Escribe un número entero de tokens, sin decimales (o déjalo vacío)." },
    } satisfies Record<string, FieldMessages>,
  },
  {
    en: {
      title: "Settings",
      intro: "It applies from the next message. Each change asks for the Google Authenticator code.",
      paused: "Paused: the bot only answers balance, reporte, deshacer and ayuda.",
      monthlyPaused: (date) => `Paused by the monthly limit until ${date}: the bot only answers balance, reporte, deshacer and ayuda.`,
      active: "On: it understands freely written messages.",
      resume: "Resume Claude",
      pause: "Pause Claude",
      limitsTitle: "Limits per account",
      limits: (perHour, perDay) => `${perHour} per hour and ${perDay} per day`,
      limitsDescription: (limits) => `${limits}, of messages with Claude.`,
      change: "Change",
      changeLimits: "Change the limits per account",
      monthlyTitle: "Monthly token limit",
      noMonthly: (used) => `No limit. ${used} tokens so far this month.`,
      reached: (used, limit, date) => `Reached: ${used} of ${limit}. Claude comes back on ${date}.`,
      monthly: (limit, used, share) => `${limit} a month, across all accounts. ${used} so far this month (${share}%).`,
      changeMonthly: "Change the monthly token limit",
      lastChange: (change) => `Last change: ${change}`,
      noChanges: "No changes: the defaults apply.",
      pauseQuestion: "Pause Claude?",
      pauseSubmit: "Pause",
      pausing: "Pausing…",
      pauseBody:
        "The bot stops calling Claude: to free text it replies to record it on the web, and balance, reporte, deshacer and ayuda keep working. While paused, it doesn't spend Anthropic credits.",
      resumeQuestion: "Resume Claude?",
      resumeSubmit: "Resume",
      resuming: "Resuming…",
      resumeBody: "The bot understands freely written messages again. Each one uses a Claude call, within each account's limits.",
      limitsBody: (perHour, perDay) =>
        `How many freely written messages Claude can interpret for each account. When an account hits the limit, the bot asks it to wait; the commands keep working. Up to ${perHour} per hour and ${perDay} per day.`,
      perHour: "Per hour",
      perDay: "Per day",
      saveLimits: "Save limits",
      saving: "Saving…",
      monthlyBody:
        "How many Claude tokens can be used a month, across all accounts. Once it's reached, the bot stops using Claude until next month (the commands keep working). Empty: no limit.",
      tokensPerMonth: "Tokens a month",
      noLimit: "No limit",
      range: (min, max) => `Between ${min} and ${max}.`,
      average: (tokens) => ` On average, each message uses ${tokens} tokens`,
      estimate: (messages) => `: enough for about ${messages} messages.`,
      saveMonthly: "Save limit",
      fields: {
        perHour: { required: "Enter how many messages per hour.", pattern: "Enter a whole number, without decimals." },
        perDay: { required: "Enter how many messages per day.", pattern: "Enter a whole number, without decimals." },
        monthlyLimit: { pattern: "Enter a whole number of tokens, without decimals (or leave it empty)." },
      },
    },
  },
);

// Cómo se escriben los números en cada idioma: el separador de miles que aceptan los campos (y que quita el
// servidor) y el formato para mostrarlos.
const NUMBERS: Readonly<Record<Locale, { thousands: RegExp; limitPattern: string; monthlyPattern: string }>> = {
  es: { thousands: /[\s.]/g, limitPattern: "\\s*\\d[\\d.]*\\s*", monthlyPattern: "\\s*[\\d.]*\\s*" },
  en: { thousands: /[\s,]/g, limitPattern: "\\s*\\d[\\d,]*\\s*", monthlyPattern: "\\s*[\\d,]*\\s*" },
};
const counter = (locale: Locale) => new Intl.NumberFormat(INTL_LOCALES[locale]).format;

export function BotSettings({ claudePaused, limits, monthlyTokenLimit, month, averageTokensPerCall, lastChange }: BotSettingsProps) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const count = counter(locale);
  const [open, setOpen] = useState<Kind | null>(null);
  const toast = useToast();
  const close = () => setOpen(null);
  // Con éxito, la ventana se cierra y el aviso emergente recibe el foco. Rojo al pausar Claude; verde lo demás.
  const finish = (tone: ToastTone) => (message: string) => {
    setOpen(null);
    toast({ tone, message, focus: true });
  };
  const start = (kind: Kind) => setOpen(kind);

  return (
    <section className="card space-y-1 p-4" aria-labelledby="configuracion">
      <h2 id="configuracion" className="font-semibold">
        {t.title}
      </h2>
      <p className="text-sm text-muted">{t.intro}</p>
      <ul className="divide-y divide-border">
        <Row
          title="Claude"
          description={
            claudePaused ? (
              <span className="font-medium text-danger">{t.paused}</span>
            ) : month.reached ? (
              <span className="font-medium text-danger">{t.monthlyPaused(month.resetsOn)}</span>
            ) : (
              t.active
            )
          }
          button={claudePaused ? t.resume : t.pause}
          danger={!claudePaused}
          onClick={() => start(claudePaused ? "resume" : "pause")}
        />
        <Row
          title={t.limitsTitle}
          description={t.limitsDescription(t.limits(count(limits.perHour), count(limits.perDay)))}
          button={t.change}
          label={t.changeLimits}
          onClick={() => start("limits")}
        />
        <Row
          title={t.monthlyTitle}
          description={
            monthlyTokenLimit === null ? (
              t.noMonthly(count(month.used))
            ) : month.reached ? (
              <span className="font-medium text-danger">{t.reached(count(month.used), count(monthlyTokenLimit), month.resetsOn)}</span>
            ) : (
              t.monthly(count(monthlyTokenLimit), count(month.used), share(month.used, monthlyTokenLimit))
            )
          }
          button={t.change}
          label={t.changeMonthly}
          onClick={() => start("monthly")}
        />
      </ul>
      <p className="text-xs text-muted">{lastChange ? t.lastChange(lastChange) : t.noChanges}</p>

      {open === "pause" && (
        <ConfirmDialog
          title={t.pauseQuestion}
          action={pauseClaudeAction}
          submit={t.pauseSubmit}
          pending={t.pausing}
          danger
          onClose={close}
          onDone={finish("removal")}
        >
          {t.pauseBody}
        </ConfirmDialog>
      )}
      {open === "resume" && (
        <ConfirmDialog
          title={t.resumeQuestion}
          action={resumeClaudeAction}
          submit={t.resumeSubmit}
          pending={t.resuming}
          onClose={close}
          onDone={finish("success")}
        >
          {t.resumeBody}
        </ConfirmDialog>
      )}
      {open === "limits" && <LimitsDialog limits={limits} onClose={close} onDone={finish("success")} />}
      {open === "monthly" && (
        <MonthlyLimitDialog limit={monthlyTokenLimit} averageTokensPerCall={averageTokensPerCall} onClose={close} onDone={finish("success")} />
      )}
    </section>
  );
}

function Row({
  title,
  description,
  button,
  label,
  danger = false,
  onClick,
}: {
  title: string;
  description: ReactNode;
  button: string;
  /** El nombre para el lector de pantalla si el texto se repite ("Cambiar"); empieza con ese texto. */
  label?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="break-words text-sm text-muted">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
          danger ? "border-danger/50 text-danger hover:bg-danger/10" : "border-border hover:bg-background"
        }`}
      >
        {button}
      </button>
    </li>
  );
}

/** Con éxito, la ventana se cierra y la tarjeta muestra el aviso (la página se vuelve a dibujar). */
function useSettingAction(action: ServerAction, onDone: (message: string) => void) {
  return useActionState<BotSettingState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.message) onDone(result.message);
    return result;
  }, {});
}

export function ConfirmDialog({
  title,
  action,
  submit,
  pending,
  danger = false,
  onClose,
  onDone,
  children,
}: {
  title: string;
  action: ServerAction;
  submit: string;
  pending: string;
  danger?: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  children: ReactNode;
}) {
  const [state, formAction, busy] = useSettingAction(action, onDone);
  const { errors, formProps } = useFieldErrors(CODE_FIELD_TEXTS[useLocale()]);
  return (
    <Dialog title={title} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            {children}
          </p>
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit={submit} pending={pending} busy={busy} danger={danger} />
        </form>
      )}
    </Dialog>
  );
}

function LimitsDialog({ limits, onClose, onDone }: { limits: AiLimits; onClose: () => void; onDone: (message: string) => void }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const count = counter(locale);
  const [state, formAction, busy] = useSettingAction(changeAiLimitsAction, onDone);
  const { errors, formProps } = useFieldErrors({ perHour: t.fields.perHour, perDay: t.fields.perDay, code: FIELD_TEXTS[locale].totpCode });
  // Controlados: React limpia el formulario al terminar la acción y, si el servidor dice que un tope
  // no sirve, lo escrito tiene que seguir ahí para corregirlo (el código sí se borra: sirve una vez).
  const [values, setValues] = useState({ perHour: String(limits.perHour), perDay: String(limits.perDay) });
  const field = (name: "perHour" | "perDay") => ({
    name,
    value: values[name],
    onChange: (value: string) => setValues((current) => ({ ...current, [name]: value })),
    state,
    clientError: errors[name],
    pattern: NUMBERS[locale].limitPattern,
  });
  return (
    <Dialog title={t.changeLimits} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            {t.limitsBody(count(AI_LIMIT_BOUNDS.perHour.max), count(AI_LIMIT_BOUNDS.perDay.max))}
          </p>
          <div className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2">
            <LimitField label={t.perHour} {...field("perHour")} />
            <LimitField label={t.perDay} {...field("perDay")} />
          </div>
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit={t.saveLimits} pending={t.saving} busy={busy} />
        </form>
      )}
    </Dialog>
  );
}

function LimitField({
  name,
  label,
  value,
  onChange,
  state,
  clientError,
  pattern,
}: {
  name: "perHour" | "perDay";
  label: string;
  value: string;
  onChange: (value: string) => void;
  state: BotSettingState;
  clientError?: string;
  /** Un entero, con el separador de miles del idioma. */
  pattern: string;
}) {
  const errorId = useId();
  // El del navegador (antes de enviar) o el del servidor (fuera de rango).
  const message = clientError ?? (state.field === name ? state.error : undefined);
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{label}</span>
        <input
          name={name}
          required
          inputMode="numeric"
          pattern={pattern}
          maxLength={6}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(message) || undefined}
          aria-describedby={describedBy(message && errorId)}
          className="input tabular-nums"
        />
      </label>
      <FieldError id={errorId} message={message} />
    </div>
  );
}

function MonthlyLimitDialog({
  limit,
  averageTokensPerCall,
  onClose,
  onDone,
}: {
  limit: number | null;
  averageTokensPerCall: number | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const count = counter(locale);
  const [state, formAction, busy] = useSettingAction(changeMonthlyLimitAction, onDone);
  const { errors, formProps } = useFieldErrors({ monthlyLimit: t.fields.monthlyLimit, code: FIELD_TEXTS[locale].totpCode });
  // Controlado, como los topes: si el servidor lo rechaza, lo escrito sigue ahí.
  const [value, setValue] = useState(limit === null ? "" : String(limit));
  const errorId = useId();
  const hintId = useId();
  const message = errors.monthlyLimit ?? (state.field === "monthlyLimit" ? state.error : undefined);
  const typed = Number(value.replace(NUMBERS[locale].thousands, ""));
  const estimate = averageTokensPerCall && typed > 0 ? Math.floor(typed / averageTokensPerCall) : null;

  return (
    <Dialog title={t.changeMonthly} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            {t.monthlyBody}
          </p>
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t.tokensPerMonth}</span>
              <input
                name="monthlyLimit"
                inputMode="numeric"
                pattern={NUMBERS[locale].monthlyPattern}
                maxLength={13}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={t.noLimit}
                aria-invalid={Boolean(message) || undefined}
                aria-describedby={describedBy(hintId, message && errorId)}
                className="input tabular-nums"
              />
            </label>
            <p id={hintId} className="text-xs text-muted">
              {t.range(count(MONTHLY_TOKEN_BOUNDS.min), count(MONTHLY_TOKEN_BOUNDS.max))}
              {averageTokensPerCall !== null && t.average(count(averageTokensPerCall))}
              {estimate !== null ? t.estimate(count(estimate)) : averageTokensPerCall !== null ? "." : ""}
            </p>
            <FieldError id={errorId} message={message} />
          </div>
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit={t.saveMonthly} pending={t.saving} busy={busy} />
        </form>
      )}
    </Dialog>
  );
}
