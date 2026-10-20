"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useToast } from "@/components/toaster";
import { type MarkReadState, markNotificationsReadAction } from "@/modules/notifications/actions";
import type { BellNotification } from "@/modules/notifications/notifications";
import { UpcomingPaymentItem } from "./dashboard/upcoming-payments";

/**
 * La campana de notificaciones, arriba a la derecha (junto al menú de la cuenta), en todas las páginas: el
 * número en rojo cuenta las que no se marcaron como leídas, y al tocarla se abre la lista con sus acciones
 * ("Registrar pago", "Este pago ya no aplica" y "Marcar como leído"). Leídas salen de la campana; los avisos
 * siguen en el Resumen. Se maneja como el menú de la cuenta: se cierra con Escape (el foco vuelve a la
 * campana), al tocar fuera o al salir con Tab; con la ventana de "Registrar pago" abierta, Escape cierra
 * solo la ventana.
 */
export function NotificationBell({ notifications, today }: { notifications: BellNotification[]; today: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const count = notifications.length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (event.target as Element | null)?.closest("dialog")) return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    // En pantallas angostas la lista se abre a lo ancho del encabezado (no de la campana: a su derecha está
    // el menú de la cuenta y se saldría por la izquierda); desde sm, debajo de la campana.
    <div
      ref={wrapper}
      className="sm:relative"
      onBlur={(event) => {
        const next = event.relatedTarget;
        // La ventana de "Registrar pago" está dentro de la lista: llevarle el foco no la cierra.
        if (next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={count > 0 ? `Notificaciones: ${count} sin leer` : "Notificaciones"}
        onClick={() => setOpen(!open)}
        className={`relative inline-flex size-11 items-center justify-center rounded-full border transition hover:bg-background pointer-fine:size-10 ${open ? "border-brand" : "border-border"}`}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden>
          <path
            fillRule="evenodd"
            d="M4 8a6 6 0 1 1 12 0c0 1.887.454 3.665 1.257 5.234a.75.75 0 0 1-.515 1.076 32.91 32.91 0 0 1-3.256.508 3.5 3.5 0 0 1-6.972 0 32.903 32.903 0 0 1-3.256-.508.75.75 0 0 1-.515-1.076A11.448 11.448 0 0 0 4 8Zm6 7c-.655 0-1.305-.02-1.95-.057a2 2 0 0 0 3.9 0c-.645.038-1.295.057-1.95.057Z"
            clipRule="evenodd"
          />
        </svg>
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-semibold tabular-nums text-danger-foreground"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      <div
        id={panelId}
        role="group"
        aria-label="Notificaciones"
        hidden={!open}
        className="card absolute inset-x-4 top-full z-30 mt-2 p-3 shadow-lg sm:inset-x-auto sm:right-0 sm:w-[22rem]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="font-semibold">Notificaciones</p>
          {count > 1 && <MarkRead ids={notifications.map((n) => n.id)} label="Marcar todas como leídas" busyLabel="Marcando…" />}
        </div>
        {count === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No tienes notificaciones nuevas.</p>
        ) : (
          <>
            <p className="text-xs text-muted">Próximos pagos de tus gastos fijos.</p>
            {/* Sin desplazamiento propio: con muchos avisos, la lista crece y se recorre con la página. */}
            <ul className="mt-1 divide-y divide-border">
              {notifications.map(({ id, item }) => (
                <UpcomingPaymentItem
                  key={id}
                  item={item}
                  today={today}
                  extra={<MarkRead ids={[id]} label="Marcar como leído" busyLabel="Marcando…" name={`Marcar como leído el pago de ${item.monthName} de ${item.description}`} />}
                />
              ))}
            </ul>
          </>
        )}
        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className="mt-1 flex min-h-11 w-full items-center border-t border-border pt-1 text-sm font-medium text-brand pointer-fine:min-h-8"
        >
          Ver los próximos pagos en el Resumen
        </Link>
      </div>
    </div>
  );
}

/** "Marcar como leído" de una o de todas: las saca de la campana y avisa abajo (verde), con el foco: ya no están. */
function MarkRead({ ids, label, busyLabel, name }: { ids: string[]; label: string; busyLabel: string; name?: string }) {
  const toast = useToast();
  const [state, formAction, busy] = useActionState<MarkReadState, FormData>(async (prev, formData) => {
    const result = await markNotificationsReadAction(prev, formData);
    if (result.message && result.tone) toast({ tone: result.tone, message: result.message, focus: true });
    return result;
  }, {});
  return (
    <form action={formAction}>
      {ids.map((id) => (
        <input key={id} type="hidden" name="id" value={id} />
      ))}
      <button
        type="submit"
        disabled={busy}
        aria-label={name}
        className="inline-flex min-h-11 items-center text-xs font-medium text-brand disabled:opacity-60 pointer-fine:min-h-6"
      >
        {busy ? busyLabel : label}
      </button>
      {state.error && (
        <span role="alert" className="block text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
