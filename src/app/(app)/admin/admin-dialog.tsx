"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { FieldError } from "@/components/field-error";
import { TOTP_CODE_MESSAGES, type FieldMessages } from "@/lib/field-errors";

// Las piezas de las ventanas de confirmación de la administración (Usuarios, Categorías): la ventana
// modal, el campo del código de Google Authenticator, los errores y los botones. El estado de cada
// formulario viene de su Server Action ({ error, field, message }).

export type DialogState = { error?: string; field?: string; message?: string };

/** La ventana se abre al montarse (modal: el resto de la página queda inerte) y Esc la cierra. */
export const openAsModal = (dialog: HTMLDialogElement | null) => {
  if (dialog && !dialog.open) dialog.showModal();
};

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: (ids: { title: string; description: string }) => ReactNode }) {
  const ids = { title: useId(), description: useId() };
  return (
    <dialog
      ref={openAsModal}
      onClose={onClose}
      aria-labelledby={ids.title}
      aria-describedby={ids.description}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="space-y-4 p-5">
        <h2 id={ids.title} className="font-semibold">
          {title}
        </h2>
        {children(ids)}
      </div>
    </dialog>
  );
}

/**
 * El aviso de una acción que terminó bien ("Se creó la categoría…"). Recibe el foco al aparecer: la
 * ventana que la hizo ya se cerró y a veces el botón que la abrió ya no existe (un "Desbloquear" ya
 * hecho), así que el teclado y el lector de pantalla siguen desde aquí, no desde el principio.
 */
export function DoneMessage({ message, className = "" }: { message: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), [message]);
  return (
    <p
      ref={ref}
      role="status"
      tabIndex={-1}
      className={`rounded-lg bg-income/10 px-3 py-2 text-sm text-income outline-none focus-visible:ring-2 focus-visible:ring-income/40 ${className}`}
    >
      {message}
    </p>
  );
}

export function FormError({ state }: { state: DialogState }) {
  // Los errores del código y del correo van junto a su campo; los demás, aquí.
  if (!state.error || state.field) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      {state.error}
    </p>
  );
}

export function Buttons({ submit, pending, busy, danger = false, disabled = false }: { submit: string; pending: string; busy: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={(event) => event.currentTarget.closest("dialog")?.close()}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-background"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={busy || disabled}
        className={danger ? "btn-danger" : "btn-primary"}
      >
        {busy ? pending : submit}
      </button>
    </div>
  );
}


/** Los mensajes del campo del código antes de enviar, para useFieldErrors de cada ventana. */
export const CODE_FIELD_MESSAGES: Record<string, FieldMessages> = { code: TOTP_CODE_MESSAGES };

/**
 * El campo del código de Google Authenticator. Muestra el error del navegador (`clientError`, antes
 * de enviar) o, si no hay, el del servidor (un código equivocado).
 */
export function CodeField({ state, clientError }: { state: DialogState; clientError?: string }) {
  const errorId = useId();
  const message = clientError ?? (state.field === "code" ? state.error : undefined);
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Código de Google Authenticator</span>
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\s*(\d\s*){6}"
          maxLength={7}
          placeholder="000000"
          aria-invalid={Boolean(message) || undefined}
          aria-describedby={message ? errorId : undefined}
          className="input font-mono tracking-[0.3em]"
        />
      </label>
      <FieldError id={errorId} message={message} />
    </div>
  );
}
