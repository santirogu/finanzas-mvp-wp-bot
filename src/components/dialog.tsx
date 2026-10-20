"use client";

import { useId, type ReactNode } from "react";

// Las ventanas modales de la app (las confirmaciones de la administración, "Registrar pago" del Resumen):
// la ventana, sus errores generales y sus botones. El estado de cada formulario viene de su Server Action
// ({ error, field, message }).

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

/** "Cancelar" (cierra la ventana) y el botón que envía; de 44 px de alto en pantallas táctiles. */
export function Buttons({ submit, pending, busy, danger = false, disabled = false }: { submit: string; pending: string; busy: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={(event) => event.currentTarget.closest("dialog")?.close()}
        className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-background pointer-fine:min-h-9"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={busy || disabled}
        className={`${danger ? "btn-danger" : "btn-primary"} min-h-11 pointer-fine:min-h-9`}
      >
        {busy ? pending : submit}
      </button>
    </div>
  );
}


