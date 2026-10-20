"use client";

import { useState } from "react";
import { useToast } from "@/components/toaster";
import { resendRepliesAction } from "./actions";
import { ConfirmDialog } from "./bot-settings";

// Reenviar las respuestas del bot que no salieron por WhatsApp en las últimas 24 horas (en la sección
// Errores de /admin/bot). El admin no las ve: solo cuántas son. Pide el código de Google
// Authenticator y queda en el historial.

export function ResendReplies({ pending, windowHours }: { pending: number; windowHours: number }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const replies = pending === 1 ? "1 respuesta" : `${pending} respuestas`;

  return (
    <div className="space-y-2">
      {pending > 0 && (
        <div className="flex flex-col items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-danger">
            {pending === 1 ? "1 respuesta no salió" : `${pending} respuestas no salieron`} en las últimas {windowHours} horas.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg border border-danger/50 px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/10"
          >
            Reenviar
          </button>
        </div>
      )}
      {open && (
        <ConfirmDialog
          title={`¿Reenviar ${replies}?`}
          action={resendRepliesAction}
          submit="Reenviar"
          pending="Reenviando…"
          onClose={() => setOpen(false)}
          onDone={(message) => {
            setOpen(false);
            toast({ tone: "success", message, focus: true });
          }}
        >
          El bot vuelve a enviarle a cada persona la respuesta que no le llegó, tal cual (no la ves ni se registra nada otra
          vez). Solo las de las últimas {windowHours} horas: después, WhatsApp no deja escribirles.
        </ConfirmDialog>
      )}
    </div>
  );
}
