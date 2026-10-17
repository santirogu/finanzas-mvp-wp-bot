"use client";

import { useActionState } from "react";
import type { ConnectionView } from "@/modules/admin/bot/bot-filters";
import { testConnectionsAction, type ConnectionsState } from "./actions";

// Probar las conexiones del bot en /admin/bot: el token de WhatsApp y la API key de Claude (sin
// enviar mensajes ni gastar créditos) y cuándo llegó el último mensaje al webhook. Solo lee: no pide
// el código. El resultado se anuncia al lector de pantalla (role="status").

export function Connections() {
  const [state, formAction, busy] = useActionState<ConnectionsState, FormData>(testConnectionsAction, {});
  const tested = Boolean(state.checkedAt);

  return (
    <section className="card space-y-3 p-4" aria-labelledby="conexiones">
      {/* En celular, el botón va debajo del texto: al lado, la explicación quedaba en una columna angosta. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="conexiones" className="font-semibold">
            Conexiones
          </h2>
          <p className="text-sm text-muted">
            Prueba el token de WhatsApp y la API key de Claude, sin enviar mensajes ni gastar créditos.
          </p>
        </div>
        <form action={formAction}>
          <button type="submit" disabled={busy} className="btn-primary shrink-0">
            {busy ? "Probando…" : tested ? "Probar otra vez" : "Probar conexiones"}
          </button>
        </form>
      </div>
      <div role="status" aria-live="polite" className="empty:hidden">
        {tested && (
          <>
            <ul className="divide-y divide-border">
              <Result name="WhatsApp" view={state.whatsapp!} />
              <Result name="Claude" view={state.claude!} />
            </ul>
            <p className="text-xs text-muted">
              {/* La hora ya termina en punto ("6:00 p. m."). */}
              {state.lastMessage ? `Último mensaje que llegó al webhook: ${state.lastMessage}` : "Todavía no ha llegado ningún mensaje al webhook."}{" "}
              Probado a las {state.checkedAt}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Result({ name, view }: { name: string; view: ConnectionView }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span
        aria-hidden
        className={`mt-0.5 flex size-5 flex-none items-center justify-center rounded-full text-xs font-bold ${
          view.ok ? "bg-income/10 text-income" : "bg-danger/10 text-danger"
        }`}
      >
        {view.ok ? "✓" : "✕"}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <p>
          <span className="font-medium">{name}:</span>{" "}
          <span className={view.ok ? "" : "font-medium text-danger"}>{view.title}</span>
        </p>
        {view.detail && <p className="break-words text-xs text-muted">{view.detail}</p>}
        {view.warning && <p className="break-words text-xs font-medium text-danger">{view.warning}</p>}
      </div>
    </li>
  );
}
