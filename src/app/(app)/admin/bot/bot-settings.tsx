"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { TOTP_CODE_MESSAGES, type FieldMessages } from "@/lib/field-errors";
import { AI_LIMIT_BOUNDS, type AiLimits } from "@/modules/bot/limits";
import { Buttons, CODE_FIELD_MESSAGES, CodeField, Dialog, DoneMessage, FormError } from "../admin-dialog";
import { changeAiLimitsAction, pauseClaudeAction, resumeClaudeAction, type BotSettingState } from "./actions";

// La configuración del bot en /admin/bot: si Claude está activo o en pausa, y los topes de mensajes
// con Claude por cuenta. Cada cambio abre una ventana que explica qué va a pasar y pide el código de
// Google Authenticator. El servidor vuelve a validar todo (src/modules/admin/bot/bot-settings.ts).

type Kind = "pause" | "resume" | "limits";
type ServerAction = (prev: BotSettingState, formData: FormData) => Promise<BotSettingState>;

export type BotSettingsProps = {
  claudePaused: boolean;
  limits: AiLimits;
  /** "Ana Admin · 16 de oct de 2026, 6:00 p. m.", o null si nadie la ha cambiado. */
  lastChange: string | null;
};

const count = new Intl.NumberFormat("es-CO").format;
const limitsText = (limits: AiLimits) => `${count(limits.perHour)} por hora y ${count(limits.perDay)} por día`;

const LIMIT_FIELD: Record<"perHour" | "perDay", FieldMessages> = {
  perHour: { required: "Escribe cuántos mensajes por hora.", pattern: "Escribe un número entero, sin decimales." },
  perDay: { required: "Escribe cuántos mensajes por día.", pattern: "Escribe un número entero, sin decimales." },
};
const LIMITS_MESSAGES: Record<string, FieldMessages> = { ...LIMIT_FIELD, code: TOTP_CODE_MESSAGES };

export function BotSettings({ claudePaused, limits, lastChange }: BotSettingsProps) {
  const [open, setOpen] = useState<Kind | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const close = () => setOpen(null);
  const finish = (message: string) => {
    setDone(message);
    setOpen(null);
  };
  const start = (kind: Kind) => {
    setDone(null);
    setOpen(kind);
  };

  return (
    <section className="card space-y-1 p-4" aria-labelledby="configuracion">
      <h2 id="configuracion" className="font-semibold">
        Configuración
      </h2>
      <p className="text-sm text-muted">Aplica desde el siguiente mensaje. Cada cambio pide el código de Google Authenticator.</p>
      {done && <DoneMessage message={done} className="!mt-3" />}
      <ul className="divide-y divide-border">
        <Row
          title="Claude"
          description={
            claudePaused ? (
              <span className="font-medium text-danger">En pausa: el bot solo responde balance, deshacer y ayuda.</span>
            ) : (
              "Activo: entiende los mensajes escritos libremente."
            )
          }
          button={claudePaused ? "Reanudar Claude" : "Pausar Claude"}
          danger={!claudePaused}
          onClick={() => start(claudePaused ? "resume" : "pause")}
        />
        <Row
          title="Topes por cuenta"
          description={`${limitsText(limits)}, de mensajes con Claude.`}
          button="Cambiar"
          onClick={() => start("limits")}
        />
      </ul>
      <p className="text-xs text-muted">{lastChange ? `Último cambio: ${lastChange}` : "Sin cambios: valen los de siempre."}</p>

      {open === "pause" && (
        <ConfirmDialog title="¿Pausar Claude?" action={pauseClaudeAction} submit="Pausar" pending="Pausando…" danger onClose={close} onDone={finish}>
          El bot deja de llamar a Claude: a lo escrito libremente responde que lo registren en la web, y balance, deshacer y
          ayuda siguen funcionando. Mientras esté en pausa no gasta créditos de Anthropic.
        </ConfirmDialog>
      )}
      {open === "resume" && (
        <ConfirmDialog title="¿Reanudar Claude?" action={resumeClaudeAction} submit="Reanudar" pending="Reanudando…" onClose={close} onDone={finish}>
          El bot vuelve a entender los mensajes escritos libremente. Cada uno usa una llamada a Claude, dentro de los topes de
          cada cuenta.
        </ConfirmDialog>
      )}
      {open === "limits" && <LimitsDialog limits={limits} onClose={close} onDone={finish} />}
    </section>
  );
}

function Row({
  title,
  description,
  button,
  danger = false,
  onClick,
}: {
  title: string;
  description: ReactNode;
  button: string;
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

function ConfirmDialog({
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
  const { errors, formProps } = useFieldErrors(CODE_FIELD_MESSAGES);
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
  const [state, formAction, busy] = useSettingAction(changeAiLimitsAction, onDone);
  const { errors, formProps } = useFieldErrors(LIMITS_MESSAGES);
  // Controlados: React limpia el formulario al terminar la acción y, si el servidor dice que un tope
  // no sirve, lo escrito tiene que seguir ahí para corregirlo (el código sí se borra: sirve una vez).
  const [values, setValues] = useState({ perHour: String(limits.perHour), perDay: String(limits.perDay) });
  const field = (name: "perHour" | "perDay") => ({
    name,
    value: values[name],
    onChange: (value: string) => setValues((current) => ({ ...current, [name]: value })),
    state,
    clientError: errors[name],
  });
  return (
    <Dialog title="Cambiar los topes por cuenta" onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            Cuántos mensajes escritos libremente puede interpretar Claude para cada cuenta. Al llegar al tope, el bot le pide
            esperar; los comandos siguen. Hasta {count(AI_LIMIT_BOUNDS.perHour.max)} por hora y{" "}
            {count(AI_LIMIT_BOUNDS.perDay.max)} por día.
          </p>
          <div className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2">
            <LimitField label="Por hora" {...field("perHour")} />
            <LimitField label="Por día" {...field("perDay")} />
          </div>
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit="Guardar topes" pending="Guardando…" busy={busy} />
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
}: {
  name: "perHour" | "perDay";
  label: string;
  value: string;
  onChange: (value: string) => void;
  state: BotSettingState;
  clientError?: string;
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
          pattern="\s*\d[\d.]*\s*"
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
