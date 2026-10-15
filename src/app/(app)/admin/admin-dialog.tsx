"use client";

import { useId, type ReactNode } from "react";

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
        className={
          // Al pasar el mouse se oscurece, como btn-primary: bajar la opacidad lo mezclaría con el fondo y
          // su texto dejaría de leerse bien (contraste).
          danger
            ? "rounded-lg bg-danger px-4 py-2 text-sm font-medium text-danger-foreground transition hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-60"
            : "btn-primary"
        }
      >
        {busy ? pending : submit}
      </button>
    </div>
  );
}


export function CodeField({ state }: { state: DialogState }) {
  const errorId = useId();
  const invalid = state.field === "code";
  // El error va fuera de la etiqueta (si no, cambiaría el nombre del campo), enlazado como descripción.
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Código de Google Authenticator</span>
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="000000"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className="input font-mono tracking-[0.3em]"
        />
      </label>
      {invalid && (
        <p id={errorId} className="text-xs text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}
