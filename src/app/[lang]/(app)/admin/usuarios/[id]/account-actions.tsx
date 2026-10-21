"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { describedBy, FieldError } from "@/components/field-error";
import { useFieldErrors } from "@/components/use-field-errors";
import { useLocale, useTexts } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { FIELD_TEXTS, type FieldMessages } from "@/lib/field-errors";
import { type ToastTone, useToast } from "@/components/toaster";
import { Buttons, CODE_FIELD_TEXTS, CodeField, Dialog, FormError } from "../../admin-dialog";
import { NOTE_MAX_LENGTH, withHourArticle } from "@/modules/admin/shared/filters";
import {
  deleteAccountByAdminAction,
  grantAdminAction,
  reactivateAccountAction,
  revokeAdminAction,
  revokeSessionsAction,
  suspendAccountAction,
  unlinkWhatsAppByAdminAction,
  unlockLoginAction,
  type AccountActionState,
} from "./actions";

// Las acciones del admin sobre una cuenta: la sección "Acciones" (solo las que aplican; reactivar, si
// está suspendida) y la "Zona de peligro" (suspender, eliminar y, solo para el super admin, darle el
// rol de admin). En la cuenta de otro admin, el super admin solo puede quitarle el rol
// (RevokeAdminActions). Cada botón abre una ventana que explica qué va a pasar y pide el código de
// Google Authenticator; eliminar pide además escribir el correo. El servidor vuelve a validar todo
// (también quién es el super admin).

type Kind = "unlock" | "sessions" | "whatsapp" | "suspend" | "reactivate" | "delete" | "grant-admin";
type ServerAction = (prev: AccountActionState, formData: FormData) => Promise<AccountActionState>;

export type ActionTarget = {
  id: string;
  name: string;
  email: string;
  /** Hasta qué hora está bloqueado el inicio de sesión ("3:15 p. m.", "3:15 PM"), o null si no lo está. */
  lockedUntil: string | null;
  openSessions: number;
  /** Su número de WhatsApp, ya con formato, o null si no tiene. */
  phone: string | null;
  /** Desde cuándo está suspendida ("15 de oct de 2026, 3:00 p. m.", "Oct 15, 2026, 3:00 PM"), o null si no lo está. */
  suspendedSince: string | null;
  /** El motivo que escribió el admin al suspenderla (interno). */
  suspensionReason: string | null;
};

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// La hora y la fecha de los avisos en español ya terminan en punto ("3:15 p. m."); en inglés, no.
const TEXTS = texts(
  {
    actions: "Acciones",
    actionsIntro: "Cada una pide el código de Google Authenticator.",
    nothing: "No tiene nada que desbloquear, cerrar ni desvincular.",
    danger: "Zona de peligro",
    reactivateTitle: "Reactivar la cuenta",
    suspendedSince: (since: string, reason: string | null) => `Suspendida desde el ${since}${reason ? ` Motivo: ${reason}` : ""}`,
    reactivate: "Reactivar",
    reactivateQuestion: (name: string) => `¿Reactivar la cuenta de ${name}?`,
    reactivating: "Reactivando…",
    reactivateBody: "Podrá volver a entrar y a usar el bot de WhatsApp.",
    unlockTitle: "Desbloquear el inicio de sesión",
    lockedUntil: (hour: string) => `Bloqueado por contraseñas equivocadas hasta ${withHourArticle(hour)}`,
    unlock: "Desbloquear",
    unlockQuestion: (name: string) => `¿Desbloquear el inicio de sesión de ${name}?`,
    unlocking: "Desbloqueando…",
    unlockBody: "Podrá volver a intentar con su contraseña de inmediato, sin esperar a que pase el bloqueo.",
    sessionsTitle: "Cerrar todas sus sesiones",
    sessionsDescription: (n: number) => `${n === 1 ? "1 sesión abierta" : `${n} sesiones abiertas`}. Su WhatsApp sigue funcionando.`,
    closeSessions: "Cerrar sesiones",
    sessionsQuestion: (name: string) => `¿Cerrar todas las sesiones de ${name}?`,
    closing: "Cerrando…",
    sessionsBody: (n: number) =>
      `Tendrá que volver a iniciar sesión en ${n === 1 ? "su dispositivo" : `${n} dispositivos`}. Su WhatsApp sigue vinculado.`,
    unlinkTitle: "Desvincular su WhatsApp",
    unlink: "Desvincular",
    unlinkQuestion: (name: string) => `¿Desvincular el WhatsApp de ${name}?`,
    unlinking: "Desvinculando…",
    unlinkBody: (phone: ReactNode): ReactNode => (
      <>El bot dejará de registrar lo que escriba desde {phone}. Podrá vincularlo otra vez desde Mi cuenta.</>
    ),
    suspendTitle: "Suspender la cuenta",
    suspendDescription: "No podrá entrar ni usar el bot hasta que la reactives. Sus datos se conservan.",
    suspend: "Suspender",
    suspendQuestion: (name: string) => `¿Suspender la cuenta de ${name}?`,
    suspending: "Suspendiendo…",
    suspendBody:
      "No podrá entrar a la web ni registrar movimientos por WhatsApp hasta que la reactives. Se cierran sus sesiones y sus datos se conservan. Al intentar entrar verá que su cuenta está suspendida, sin el motivo.",
    reason: "Motivo",
    reasonHint: "(opcional, solo lo ves tú)",
    deleteTitle: "Eliminar la cuenta",
    deleteDescription: "Borra la cuenta y todos sus datos. No se puede deshacer.",
    deleteAccount: "Eliminar cuenta",
    deleteQuestion: (name: string) => `¿Eliminar la cuenta de ${name}?`,
    deleting: "Eliminando…",
    deleteBody:
      "Se borran su cuenta, sus movimientos, sus categorías, su WhatsApp y su historial. No se puede deshacer. En el historial solo queda que eliminaste una cuenta, sin su nombre ni su correo.",
    typeEmail: "Escribe su correo:",
    emailRequired: "Escribe el correo de la cuenta.",
    grantTitle: "Darle el rol de admin",
    grantDescription: "Verá la sección de administración, con datos de todas las cuentas.",
    grant: "Hacer admin",
    grantQuestion: (name: string) => `¿Hacer admin a ${name}?`,
    granting: "Dando el rol…",
    grantBody:
      "Verá la sección de administración, con los datos de todas las cuentas. Se cierran sus sesiones y, al volver a entrar, tendrá que configurar la verificación en dos pasos. Solo tú puedes quitarle el rol.",
    revokeTitle: "Quitarle el rol de admin",
    revokeDescription: "Vuelve a ser usuario: se borra su verificación en dos pasos y se cierran sus sesiones.",
    revoke: "Quitar admin",
    revokeQuestion: (name: string) => `¿Quitarle el rol de admin a ${name}?`,
    revoking: "Quitando el rol…",
    revokeBody:
      "Vuelve a ser usuario. Se borran su verificación en dos pasos y sus códigos de respaldo, y se cierran sus sesiones. Sus finanzas no se tocan.",
  },
  {
    en: {
      actions: "Actions",
      actionsIntro: "Each one asks for the Google Authenticator code.",
      nothing: "There's nothing to unlock, sign out or unlink.",
      danger: "Danger zone",
      reactivateTitle: "Reactivate the account",
      suspendedSince: (since, reason) => `Suspended since ${since}.${reason ? ` Reason: ${reason}` : ""}`,
      reactivate: "Reactivate",
      reactivateQuestion: (name) => `Reactivate ${name}'s account?`,
      reactivating: "Reactivating…",
      reactivateBody: "They'll be able to sign in and use the WhatsApp bot again.",
      unlockTitle: "Unlock sign-in",
      lockedUntil: (hour) => `Locked after wrong passwords until ${hour}.`,
      unlock: "Unlock",
      unlockQuestion: (name) => `Unlock ${name}'s sign-in?`,
      unlocking: "Unlocking…",
      unlockBody: "They can try their password again right away, without waiting for the lock to end.",
      sessionsTitle: "Sign out all their sessions",
      sessionsDescription: (n) => `${n === 1 ? "1 open session" : `${n} open sessions`}. Their WhatsApp keeps working.`,
      closeSessions: "Sign out",
      sessionsQuestion: (name) => `Sign ${name} out of all their sessions?`,
      closing: "Signing out…",
      sessionsBody: (n) => `They'll have to sign in again on ${n === 1 ? "their device" : `${n} devices`}. Their WhatsApp stays linked.`,
      unlinkTitle: "Unlink their WhatsApp",
      unlink: "Unlink",
      unlinkQuestion: (name) => `Unlink ${name}'s WhatsApp?`,
      unlinking: "Unlinking…",
      unlinkBody: (phone) => <>The bot will stop recording what they write from {phone}. They can link it again from My account.</>,
      suspendTitle: "Suspend the account",
      suspendDescription: "They won't be able to sign in or use the bot until you reactivate it. Their data is kept.",
      suspend: "Suspend",
      suspendQuestion: (name) => `Suspend ${name}'s account?`,
      suspending: "Suspending…",
      suspendBody:
        "They won't be able to sign in on the web or record transactions by WhatsApp until you reactivate it. Their sessions are signed out and their data is kept. When they try to sign in, they'll see their account is suspended, without the reason.",
      reason: "Reason",
      reasonHint: "(optional, only you see it)",
      deleteTitle: "Delete the account",
      deleteDescription: "Deletes the account and all its data. This can't be undone.",
      deleteAccount: "Delete account",
      deleteQuestion: (name) => `Delete ${name}'s account?`,
      deleting: "Deleting…",
      deleteBody:
        "Their account, transactions, categories, WhatsApp and history are deleted. This can't be undone. The history only keeps that you deleted an account, without its name or email.",
      typeEmail: "Type their email:",
      emailRequired: "Type the account's email.",
      grantTitle: "Make them an admin",
      grantDescription: "They'll see the admin section, with data from every account.",
      grant: "Make admin",
      grantQuestion: (name) => `Make ${name} an admin?`,
      granting: "Granting the role…",
      grantBody:
        "They'll see the admin section, with the data of every account. Their sessions are signed out and, when they sign in again, they'll have to set up two-step verification. Only you can remove the role.",
      revokeTitle: "Remove their admin role",
      revokeDescription: "They go back to being a user: their two-step verification is deleted and their sessions are signed out.",
      revoke: "Remove admin",
      revokeQuestion: (name) => `Remove ${name}'s admin role?`,
      revoking: "Removing the role…",
      revokeBody:
        "They go back to being a user. Their two-step verification and backup codes are deleted, and their sessions are signed out. Their finances aren't touched.",
    },
  },
);

// Los errores de los campos de eliminar antes de enviar, en el idioma de la página (en vez del globo del navegador).
const deleteMessages = (locale: Locale): Record<string, FieldMessages> => ({
  email: { required: TEXTS[locale].emailRequired, email: FIELD_TEXTS[locale].email },
  code: FIELD_TEXTS[locale].totpCode,
});

export function AccountActions({
  target,
  canMakeAdmin = false,
}: {
  target: ActionTarget;
  /** Solo para el super admin, y si la cuenta no está suspendida (lo decide el servidor). */
  canMakeAdmin?: boolean;
}) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState<Kind | null>(null);
  const toast = useToast();
  const close = () => setOpen(null);
  // Con éxito, la ventana se cierra y el aviso emergente recibe el foco (el botón que la abrió a veces
  // ya no está: un "Desbloquear" ya hecho). Verde lo que se activa; rojo lo que se quita o se apaga.
  const finish = (tone: ToastTone) => (message: string) => {
    setOpen(null);
    toast({ tone, message, focus: true });
  };
  const start = (kind: Kind) => setOpen(kind);

  return (
    <>
      <section className="card space-y-1 p-4" aria-labelledby="acciones">
        <h2 id="acciones" className="font-semibold">
          {t.actions}
        </h2>
        <p className="text-sm text-muted">{t.actionsIntro}</p>
        {target.suspendedSince || target.lockedUntil || target.openSessions > 0 || target.phone ? (
          <ul className="divide-y divide-border">
            {target.suspendedSince && (
              <ActionRow
                title={t.reactivateTitle}
                description={t.suspendedSince(target.suspendedSince, target.suspensionReason)}
                button={t.reactivate}
                onClick={() => start("reactivate")}
              />
            )}
            {target.lockedUntil && (
              <ActionRow
                title={t.unlockTitle}
                description={t.lockedUntil(target.lockedUntil)}
                button={t.unlock}
                onClick={() => start("unlock")}
              />
            )}
            {target.openSessions > 0 && (
              <ActionRow
                title={t.sessionsTitle}
                description={t.sessionsDescription(target.openSessions)}
                button={t.closeSessions}
                onClick={() => start("sessions")}
              />
            )}
            {target.phone && (
              <ActionRow title={t.unlinkTitle} description={target.phone} button={t.unlink} onClick={() => start("whatsapp")} />
            )}
          </ul>
        ) : (
          <p className="pt-2 text-sm text-muted">{t.nothing}</p>
        )}
      </section>

      <section className="card space-y-1 border-danger/40 p-4" aria-labelledby="peligro">
        <h2 id="peligro" className="font-semibold text-danger">
          {t.danger}
        </h2>
        <ul className="divide-y divide-border">
          {!target.suspendedSince && (
            <ActionRow
              title={t.suspendTitle}
              description={t.suspendDescription}
              button={t.suspend}
              danger
              onClick={() => start("suspend")}
            />
          )}
          <ActionRow
            title={t.deleteTitle}
            description={t.deleteDescription}
            button={t.deleteAccount}
            danger
            onClick={() => start("delete")}
          />
          {canMakeAdmin && (
            <ActionRow
              title={t.grantTitle}
              description={t.grantDescription}
              button={t.grant}
              danger
              onClick={() => start("grant-admin")}
            />
          )}
        </ul>
      </section>

      {open === "unlock" && (
        <ConfirmDialog
          title={t.unlockQuestion(target.name)}
          action={unlockLoginAction}
          submit={t.unlock}
          pending={t.unlocking}
          userId={target.id}
          onClose={close}
          onDone={finish("success")}
        >
          {t.unlockBody}
        </ConfirmDialog>
      )}
      {open === "sessions" && (
        <ConfirmDialog
          title={t.sessionsQuestion(target.name)}
          action={revokeSessionsAction}
          submit={t.closeSessions}
          pending={t.closing}
          userId={target.id}
          onClose={close}
          onDone={finish("removal")}
        >
          {t.sessionsBody(target.openSessions)}
        </ConfirmDialog>
      )}
      {open === "whatsapp" && (
        <ConfirmDialog
          title={t.unlinkQuestion(target.name)}
          action={unlinkWhatsAppByAdminAction}
          submit={t.unlink}
          pending={t.unlinking}
          userId={target.id}
          onClose={close}
          onDone={finish("removal")}
        >
          {t.unlinkBody(<span className="whitespace-nowrap">{target.phone}</span>)}
        </ConfirmDialog>
      )}
      {open === "suspend" && (
        <ConfirmDialog
          title={t.suspendQuestion(target.name)}
          action={suspendAccountAction}
          submit={t.suspend}
          pending={t.suspending}
          danger
          userId={target.id}
          onClose={close}
          onDone={finish("removal")}
          extra={<ReasonField />}
        >
          {t.suspendBody}
        </ConfirmDialog>
      )}
      {open === "reactivate" && (
        <ConfirmDialog
          title={t.reactivateQuestion(target.name)}
          action={reactivateAccountAction}
          submit={t.reactivate}
          pending={t.reactivating}
          userId={target.id}
          onClose={close}
          onDone={finish("success")}
        >
          {t.reactivateBody}
        </ConfirmDialog>
      )}
      {open === "delete" && <DeleteDialog target={target} onClose={close} />}
      {open === "grant-admin" && (
        <ConfirmDialog
          title={t.grantQuestion(target.name)}
          action={grantAdminAction}
          submit={t.grant}
          pending={t.granting}
          danger
          userId={target.id}
          onClose={close}
          onDone={finish("success")}
        >
          {t.grantBody}
        </ConfirmDialog>
      )}
    </>
  );
}

/**
 * En la cuenta de otro admin, lo único que hay: el super admin le puede quitar el rol (nunca al super
 * admin, que es él mismo). El servidor decide si se muestra.
 */
export function RevokeAdminActions({ target }: { target: { id: string; name: string } }) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <>
      <section className="card space-y-1 border-danger/40 p-4" aria-labelledby="peligro">
        <h2 id="peligro" className="font-semibold text-danger">
          {t.danger}
        </h2>
        <ul className="divide-y divide-border">
          <ActionRow
            title={t.revokeTitle}
            description={t.revokeDescription}
            button={t.revoke}
            danger
            onClick={() => setOpen(true)}
          />
        </ul>
      </section>
      {open && (
        <ConfirmDialog
          title={t.revokeQuestion(target.name)}
          action={revokeAdminAction}
          submit={t.revoke}
          pending={t.revoking}
          danger
          userId={target.id}
          onClose={() => setOpen(false)}
          // El botón que la abrió ya no estará (la cuenta deja de ser admin): el foco va al aviso.
          onDone={(message) => {
            setOpen(false);
            toast({ tone: "removal", message, focus: true });
          }}
        >
          {t.revokeBody}
        </ConfirmDialog>
      )}
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
  const t = useTexts(TEXTS);
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">
        {t.reason} <span className="font-normal text-muted">{t.reasonHint}</span>
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
  const locale = useLocale();
  const { errors, formProps } = useFieldErrors(CODE_FIELD_TEXTS[locale]);

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
  const locale = useLocale();
  const t = TEXTS[locale];
  const [state, formAction, busy] = useActionState<AccountActionState, FormData>(deleteAccountByAdminAction, {});
  const { errors, formProps } = useFieldErrors(deleteMessages(locale));
  const [email, setEmail] = useState("");
  const emailErrorId = useId();
  // El del navegador (antes de enviar) o el del servidor (otro correo).
  const emailError = errors.email ?? (state.field === "email" ? state.error : undefined);

  return (
    <Dialog title={t.deleteQuestion(target.name)} onClose={onClose}>
      {(ids) => (
        <form action={formAction} {...formProps} className="space-y-4">
          <p id={ids.description} className="text-sm text-muted">
            {t.deleteBody}
          </p>
          <input type="hidden" name="userId" value={target.id} />
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                {t.typeEmail} <span className="break-all font-mono">{target.email}</span>
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
          <Buttons submit={t.deleteAccount} pending={t.deleting} busy={busy} danger disabled={!sameEmail(email, target.email)} />
        </form>
      )}
    </Dialog>
  );
}
