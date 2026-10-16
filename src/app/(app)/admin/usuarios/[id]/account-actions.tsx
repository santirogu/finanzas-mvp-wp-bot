"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { EMAIL_MESSAGE, TOTP_CODE_MESSAGES, type FieldMessages } from "@/lib/field-errors";
import { Buttons, CODE_FIELD_MESSAGES, CodeField, Dialog, DoneMessage, FormError } from "../../admin-dialog";
import { NOTE_MAX_LENGTH } from "@/modules/admin/shared/filters";
import {
  deleteAccountByAdminAction,
  reactivateAccountAction,
  revokeSessionsAction,
  suspendAccountAction,
  unlinkWhatsAppByAdminAction,
  unlockLoginAction,
  type AccountActionState,
} from "./actions";

// Las acciones del admin sobre una cuenta: la sección "Acciones" (solo las que aplican; reactivar, si
// está suspendida) y la "Zona de peligro" (suspender y eliminar). Cada botón abre una ventana que
// explica qué va a pasar y pide el código de Google Authenticator; eliminar pide además escribir el
// correo. El servidor vuelve a validar todo.

type Kind = "unlock" | "sessions" | "whatsapp" | "suspend" | "reactivate" | "delete";
type ServerAction = (prev: AccountActionState, formData: FormData) => Promise<AccountActionState>;

export type ActionTarget = {
  id: string;
  name: string;
  email: string;
  /** Hasta qué hora está bloqueado el inicio de sesión ("3:15 p. m."), o null si no lo está. */
  lockedUntil: string | null;
  openSessions: number;
  /** Su número de WhatsApp, ya con formato, o null si no tiene. */
  phone: string | null;
  /** Desde cuándo está suspendida ("15 de oct de 2026, 3:00 p. m."), o null si no lo está. */
  suspendedSince: string | null;
  /** El motivo que escribió el admin al suspenderla (interno). */
  suspensionReason: string | null;
};

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

// Los errores de los campos de eliminar antes de enviar, en español (en vez del globo del navegador).
const DELETE_MESSAGES: Record<string, FieldMessages> = {
  email: { required: "Escribe el correo de la cuenta.", email: EMAIL_MESSAGE },
  code: TOTP_CODE_MESSAGES,
};

export function AccountActions({ target }: { target: ActionTarget }) {
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
  const sessions = plural(target.openSessions, "1 sesión abierta", "sesiones abiertas");

  return (
    <>
      <section className="card space-y-1 p-4" aria-labelledby="acciones">
        <h2 id="acciones" className="font-semibold">
          Acciones
        </h2>
        <p className="text-sm text-muted">Cada una pide el código de Google Authenticator.</p>
        {done && <DoneMessage message={done} className="!mt-3" />}
        {target.suspendedSince || target.lockedUntil || target.openSessions > 0 || target.phone ? (
          <ul className="divide-y divide-border">
            {target.suspendedSince && (
              <ActionRow
                title="Reactivar la cuenta"
                // La fecha ya termina en punto ("3:00 p. m.").
                description={`Suspendida desde el ${target.suspendedSince}${target.suspensionReason ? ` Motivo: ${target.suspensionReason}` : ""}`}
                button="Reactivar"
                onClick={() => start("reactivate")}
              />
            )}
            {target.lockedUntil && (
              <ActionRow
                title="Desbloquear el inicio de sesión"
                // La hora ya termina en punto ("3:15 p. m.").
                description={`Bloqueado por contraseñas equivocadas hasta las ${target.lockedUntil}`}
                button="Desbloquear"
                onClick={() => start("unlock")}
              />
            )}
            {target.openSessions > 0 && (
              <ActionRow
                title="Cerrar todas sus sesiones"
                description={`${sessions}. Su WhatsApp sigue funcionando.`}
                button="Cerrar sesiones"
                onClick={() => start("sessions")}
              />
            )}
            {target.phone && (
              <ActionRow title="Desvincular su WhatsApp" description={target.phone} button="Desvincular" onClick={() => start("whatsapp")} />
            )}
          </ul>
        ) : (
          <p className="pt-2 text-sm text-muted">No tiene nada que desbloquear, cerrar ni desvincular.</p>
        )}
      </section>

      <section className="card space-y-1 border-danger/40 p-4" aria-labelledby="peligro">
        <h2 id="peligro" className="font-semibold text-danger">
          Zona de peligro
        </h2>
        <ul className="divide-y divide-border">
          {!target.suspendedSince && (
            <ActionRow
              title="Suspender la cuenta"
              description="No podrá entrar ni usar el bot hasta que la reactives. Sus datos se conservan."
              button="Suspender"
              danger
              onClick={() => start("suspend")}
            />
          )}
          <ActionRow
            title="Eliminar la cuenta"
            description="Borra la cuenta y todos sus datos. No se puede deshacer."
            button="Eliminar cuenta"
            danger
            onClick={() => start("delete")}
          />
        </ul>
      </section>

      {open === "unlock" && (
        <ConfirmDialog
          title={`¿Desbloquear el inicio de sesión de ${target.name}?`}
          action={unlockLoginAction}
          submit="Desbloquear"
          pending="Desbloqueando…"
          userId={target.id}
          onClose={close}
          onDone={finish}
        >
          Podrá volver a intentar con su contraseña de inmediato, sin esperar a que pase el bloqueo.
        </ConfirmDialog>
      )}
      {open === "sessions" && (
        <ConfirmDialog
          title={`¿Cerrar todas las sesiones de ${target.name}?`}
          action={revokeSessionsAction}
          submit="Cerrar sesiones"
          pending="Cerrando…"
          userId={target.id}
          onClose={close}
          onDone={finish}
        >
          Tendrá que volver a iniciar sesión en {plural(target.openSessions, "su dispositivo", "dispositivos")}. Su
          WhatsApp sigue vinculado.
        </ConfirmDialog>
      )}
      {open === "whatsapp" && (
        <ConfirmDialog
          title={`¿Desvincular el WhatsApp de ${target.name}?`}
          action={unlinkWhatsAppByAdminAction}
          submit="Desvincular"
          pending="Desvinculando…"
          userId={target.id}
          onClose={close}
          onDone={finish}
        >
          El bot dejará de registrar lo que escriba desde <span className="whitespace-nowrap">{target.phone}</span>. Podrá
          vincularlo otra vez desde su Resumen.
        </ConfirmDialog>
      )}
      {open === "suspend" && (
        <ConfirmDialog
          title={`¿Suspender la cuenta de ${target.name}?`}
          action={suspendAccountAction}
          submit="Suspender"
          pending="Suspendiendo…"
          danger
          userId={target.id}
          onClose={close}
          onDone={finish}
          extra={<ReasonField />}
        >
          No podrá entrar a la web ni registrar movimientos por WhatsApp hasta que la reactives. Se cierran sus
          sesiones y sus datos se conservan. Al intentar entrar verá que su cuenta está suspendida, sin el motivo.
        </ConfirmDialog>
      )}
      {open === "reactivate" && (
        <ConfirmDialog
          title={`¿Reactivar la cuenta de ${target.name}?`}
          action={reactivateAccountAction}
          submit="Reactivar"
          pending="Reactivando…"
          userId={target.id}
          onClose={close}
          onDone={finish}
        >
          Podrá volver a entrar y a usar el bot de WhatsApp.
        </ConfirmDialog>
      )}
      {open === "delete" && <DeleteDialog target={target} onClose={close} />}
    </>
  );
}

function ActionRow({
  title,
  description,
  button,
  danger = false,
  onClick,
}: {
  title: string;
  description: string;
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

/** El motivo de una suspensión: opcional e interno (la persona no lo ve). */
function ReasonField() {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">
        Motivo <span className="font-normal text-muted">(opcional, solo lo ves tú)</span>
      </span>
      <textarea name="reason" rows={2} maxLength={NOTE_MAX_LENGTH} className="input" />
    </label>
  );
}

function ConfirmDialog({
  title,
  action,
  submit,
  pending,
  danger = false,
  userId,
  onClose,
  onDone,
  extra,
  children,
}: {
  title: string;
  action: ServerAction;
  submit: string;
  pending: string;
  danger?: boolean;
  userId: string;
  onClose: () => void;
  onDone: (message: string) => void;
  /** Campos además del código (el motivo al suspender). */
  extra?: ReactNode;
  children: ReactNode;
}) {
  // Con éxito, la ventana se cierra y la sección muestra el aviso (la página se vuelve a dibujar).
  const [state, formAction, busy] = useActionState<AccountActionState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.message) onDone(result.message);
    return result;
  }, {});
  const { errors, formProps } = useFieldErrors(CODE_FIELD_MESSAGES);

  return (
    <Dialog title={title} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            {children}
          </p>
          <input type="hidden" name="userId" value={userId} />
          {extra}
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit={submit} pending={pending} busy={busy} danger={danger} />
        </form>
      )}
    </Dialog>
  );
}

function DeleteDialog({ target, onClose }: { target: ActionTarget; onClose: () => void }) {
  // Con éxito, el servidor lleva a la lista: aquí solo vuelven los errores.
  const [state, formAction, busy] = useActionState<AccountActionState, FormData>(deleteAccountByAdminAction, {});
  const { errors, formProps } = useFieldErrors(DELETE_MESSAGES);
  const [email, setEmail] = useState("");
  const emailErrorId = useId();
  // El del navegador (antes de enviar) o el del servidor (otro correo).
  const emailError = errors.email ?? (state.field === "email" ? state.error : undefined);

  return (
    <Dialog title={`¿Eliminar la cuenta de ${target.name}?`} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            Se borran su cuenta, sus movimientos, sus categorías, su WhatsApp y su historial. No se puede deshacer. En el
            historial queda solo “se eliminó una cuenta”.
          </p>
          <input type="hidden" name="userId" value={target.id} />
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Escribe su correo: <span className="break-all font-mono">{target.email}</span>
              </span>
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(emailError) || undefined}
                aria-describedby={describedBy(emailError && emailErrorId)}
                className="input"
              />
            </label>
            <FieldError id={emailErrorId} message={emailError} />
          </div>
          <CodeField state={state} clientError={errors.code} />
          <FormError state={state} />
          <Buttons submit="Eliminar cuenta" pending="Eliminando…" busy={busy} danger disabled={!sameEmail(email, target.email)} />
        </form>
      )}
    </Dialog>
  );
}
