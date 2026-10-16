"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { restoreTransactionAction } from "@/modules/transactions/actions";

/**
 * El aviso de la lista después de borrar un movimiento ("Se borró… · Deshacer") o de restaurarlo.
 * Al aparecer recibe el foco: con el teclado o un lector de pantalla se sigue desde aquí, no desde
 * el principio de la página (el movimiento borrado ya no está para volver a él).
 */
export function TransactionNotice({
  kind,
  id,
  description,
  closeHref,
}: {
  kind: "deleted" | "restored";
  id: string;
  description: string;
  /** La lista sin el aviso. */
  closeHref: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [kind, id]);

  return (
    <div
      ref={ref}
      role="status"
      tabIndex={-1}
      className="flex items-center gap-2 border-b border-border bg-background px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <p className="min-w-0 flex-1">
        {kind === "deleted" ? "Se borró" : "Se restauró"} «{description}».
      </p>
      {kind === "deleted" && (
        <form action={restoreTransactionAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-md px-3 font-medium text-brand hover:bg-brand/10 pointer-fine:min-h-8"
          >
            Deshacer
          </button>
        </form>
      )}
      <Link
        href={closeHref}
        aria-label="Cerrar el aviso"
        className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-border/60 hover:text-foreground pointer-fine:size-8"
      >
        <span aria-hidden>×</span>
      </Link>
    </div>
  );
}
