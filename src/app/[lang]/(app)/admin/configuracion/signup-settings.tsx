"use client";

import { useActionState, useId, useState } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { type ToastTone, useToast } from "@/components/toaster";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale, useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { FIELD_TEXTS } from "@/lib/field-errors";
import { SIGNUP_MODES, type SignupMode } from "@/modules/auth/signup-modes";
import { Buttons, CODE_FIELD_TEXTS, CodeField, Dialog, FormError } from "../admin-dialog";
import { addSignupInviteAction, changeSignupModeAction, removeSignupInviteAction, type SignupSettingState } from "./actions";

// Los registros en /admin/configuracion: quién puede crear una cuenta (cambiarlo pide el código de Google
// Authenticator) y los correos invitados (agregarlos y quitarlos no lo pide, pero queda en el historial). El
// servidor vuelve a validar todo (src/modules/admin/configuracion/signup.ts).

type ServerAction = (prev: SignupSettingState, formData: FormData) => Promise<SignupSettingState>;

export type SignupInviteRow = {
  email: string;
  /** "22 de oct. de 2026": cuándo se invitó o, si ya creó su cuenta, cuándo. */
  date: string;
  used: boolean;
};

export type SignupSettingsProps = {
  mode: SignupMode;
  invites: SignupInviteRow[];
  /** "Ana Admin · 16 de oct. de 2026, 6:00 p. m.", o null si nadie lo ha cambiado. */
  lastChange: string | null;
};

const TEXTS = texts(
  {
    title: "Registros",
    intro: "Quién puede crear una cuenta. Las cuentas que ya existen siguen entrando igual.",
    modes: {
      open: { label: "Abiertos", description: "Cualquiera puede crear una cuenta." },
      invite: { label: "Solo con invitación", description: "Solo los correos invitados pueden crear una cuenta." },
      closed: { label: "Cerrados", description: "Nadie puede crear una cuenta nueva." },
    } satisfies Record<SignupMode, { label: string; description: string }>,
    change: "Cambiar",
    changeLabel: "Cambiar quién puede crear una cuenta",
    lastChange: (change: string) => `Último cambio: ${change}`,
    noChanges: "Sin cambios: abiertos, como siempre.",
    changeBody: "Aplica de inmediato en la página de registro. Pide el código de Google Authenticator.",
    legend: "Registros",
    current: "los de ahora",
    save: "Cambiar",
    saving: "Guardando…",
    invitesTitle: "Invitados",
    invitesIntro: (active: boolean) =>
      `${active ? "Solo estos correos pueden crear una cuenta." : "Sirven cuando los registros son solo con invitación."} Agregar o quitar uno no pide el código: queda en el historial.`,
    email: "Correo",
    invite: "Invitar",
    inviting: "Invitando…",
    noInvites: "Todavía no hay invitados.",
    invites: "Correos invitados",
    pending: (date: string) => `Pendiente · invitado el ${date}`,
    used: (date: string) => `Creó su cuenta el ${date}`,
    remove: "Quitar",
    removing: "Quitando…",
    removeLabel: (email: string) => `Quitar la invitación de ${email}`,
    emailRequired: "Escribe el correo.",
  },
  {
    en: {
      title: "Sign-ups",
      intro: "Who can create an account. Existing accounts keep signing in as usual.",
      modes: {
        open: { label: "Open", description: "Anyone can create an account." },
        invite: { label: "Invitation only", description: "Only invited emails can create an account." },
        closed: { label: "Closed", description: "Nobody can create a new account." },
      },
      change: "Change",
      changeLabel: "Change who can create an account",
      lastChange: (change) => `Last change: ${change}`,
      noChanges: "No changes: open, as always.",
      changeBody: "It applies right away on the sign-up page. It asks for the Google Authenticator code.",
      legend: "Sign-ups",
      current: "current",
      save: "Change",
      saving: "Saving…",
      invitesTitle: "Invited",
      invitesIntro: (active) =>
        `${active ? "Only these emails can create an account." : "They're used when sign-ups are invitation only."} Adding or removing one doesn't ask for the code: it stays in the history.`,
      email: "Email",
      invite: "Invite",
      inviting: "Inviting…",
      noInvites: "There are no invited emails yet.",
      invites: "Invited emails",
      pending: (date) => `Pending · invited on ${date}`,
      used: (date) => `Created their account on ${date}`,
      remove: "Remove",
      removing: "Removing…",
      removeLabel: (email) => `Remove the invitation for ${email}`,
      emailRequired: "Enter the email.",
    },
  },
);

export function SignupSettings({ mode, invites, lastChange }: SignupSettingsProps) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  // Con éxito, el aviso emergente: verde al cambiar el modo o invitar; rojo al quitar una invitación. Recibe el foco
  // cuando lo que lo tenía desaparece (la ventana se cierra, la fila quitada se va); al invitar, el foco sigue en el
  // formulario para invitar otro correo, y el aviso se anuncia igual (aria-live).
  const notify = (tone: ToastTone, focus = true) => (message: string) => {
    setOpen(false);
    toast({ tone, message, focus });
  };

  return (
    <section className="card space-y-4 p-4" aria-labelledby="registros">
      <div className="space-y-1">
        <h2 id="registros" className="font-semibold">
          {t.title}
        </h2>
        <p className="text-sm text-muted">{t.intro}</p>
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t.modes[mode].label}</p>
          <p className="text-sm text-muted">{t.modes[mode].description}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.changeLabel}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-background"
        >
          {t.change}
        </button>
      </div>
      <p className="text-xs text-muted">{lastChange ? t.lastChange(lastChange) : t.noChanges}</p>

      <section aria-labelledby="invitados" className="space-y-3 border-t border-border pt-3">
        <div className="space-y-1">
          <h3 id="invitados" className="text-sm font-semibold">
            {t.invitesTitle}
          </h3>
          <p className="text-sm text-muted">{t.invitesIntro(mode === "invite")}</p>
        </div>
        <InviteForm onDone={notify("success", false)} />
        {invites.length === 0 ? (
          <p className="text-sm text-muted">{t.noInvites}</p>
        ) : (
          <ul aria-label={t.invites} className="divide-y divide-border">
            {invites.map((invite) => (
              <li key={invite.email} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium">{invite.email}</p>
                  <p className={`text-xs ${invite.used ? "text-income" : "text-muted"}`}>{invite.used ? t.used(invite.date) : t.pending(invite.date)}</p>
                </div>
                <RemoveButton email={invite.email} onDone={notify("removal")} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && <ModeDialog current={mode} onClose={() => setOpen(false)} onDone={notify("success")} />}
    </section>
  );
}

/** Con éxito, avisa (la página se vuelve a dibujar). */
function useNotifyingAction(action: ServerAction, onDone: (message: string) => void) {
  return useActionState<SignupSettingState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.message) onDone(result.message);
    return result;
  }, {});
}

function InviteForm({ onDone }: { onDone: (message: string) => void }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  // Controlado: si el servidor lo rechaza (ya invitado, ya tiene cuenta), lo escrito sigue ahí; con éxito se vacía.
  const [email, setEmail] = useState("");
  const [state, formAction, busy] = useNotifyingAction(addSignupInviteAction, (message) => {
    setEmail("");
    onDone(message);
  });
  const { errors, formProps } = useFieldErrors({ email: { required: t.emailRequired, email: FIELD_TEXTS[locale].email } });
  const inputId = useId();
  const errorId = useId();
  const message = errors.email ?? (state.field === "email" ? state.error : undefined);
  return (
    <form action={formAction} {...formProps} className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {t.email}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          name="email"
          type="email"
          required
          autoComplete="off"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(message) || undefined}
          aria-describedby={describedBy(message && errorId)}
          className="input min-w-0 flex-1"
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {busy ? t.inviting : t.invite}
        </button>
      </div>
      <FieldError id={errorId} message={message} />
      <FormError state={state} />
    </form>
  );
}

function RemoveButton({ email, onDone }: { email: string; onDone: (message: string) => void }) {
  const t = useTexts(TEXTS);
  const [state, formAction, busy] = useNotifyingAction(removeSignupInviteAction, onDone);
  return (
    <form action={formAction} className="flex shrink-0 flex-col items-end">
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={busy}
        aria-label={t.removeLabel(email)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-background disabled:opacity-60"
      >
        {busy ? t.removing : t.remove}
      </button>
      {state.error && (
        <span role="alert" className="mt-1 text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

function ModeDialog({ current, onClose, onDone }: { current: SignupMode; onClose: () => void; onDone: (message: string) => void }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  // React vacía el formulario al terminar la acción (también los radios controlados): la opción enviada vuelve
  // con el estado y defaultChecked, como en los presupuestos. El código no: sirve una sola vez.
  const [state, formAction, busy] = useActionState<SignupSettingState & { mode?: string }, FormData>(async (prev, formData) => {
    const result = await changeSignupModeAction(prev, formData);
    if (result.message) onDone(result.message);
    return { ...result, mode: String(formData.get("mode") ?? "") };
  }, {});
  const { errors, formProps } = useFieldErrors(CODE_FIELD_TEXTS[locale]);
  const [chosen, setChosen] = useState<string>(current);
  const errorId = useId();
  const message = state.field === "mode" ? state.error : undefined;

  return (
    <Dialog title={t.changeLabel} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            {t.changeBody}
          </p>
          <fieldset aria-describedby={describedBy(message && errorId)} className="space-y-2">
            <legend className="text-sm font-medium">{t.legend}</legend>
            {SIGNUP_MODES.map((mode) => (
              <label
                key={mode}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-control p-3 transition has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
              >
                <input
                  type="radio"
                  name="mode"
                  value={mode}
                  defaultChecked={(state.mode ?? current) === mode}
                  onChange={() => setChosen(mode)}
                  className="mt-0.5 size-4 accent-[var(--brand)]"
                />
                <span className="min-w-0 text-sm">
                  <span className="block font-medium">
                    {t.modes[mode].label}
                    {mode === current && (
                      <>
                        {" "}
                        <span className="font-normal text-muted">({t.current})</span>
                      </>
                    )}
                  </span>
                  <span className="block text-muted">{t.modes[mode].description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <FieldError id={errorId} message={message} />
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit={t.save} pending={t.saving} busy={busy} disabled={chosen === current} />
        </form>
      )}
    </Dialog>
  );
}
