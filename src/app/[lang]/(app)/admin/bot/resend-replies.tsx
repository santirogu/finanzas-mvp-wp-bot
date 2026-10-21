"use client";

import { useState } from "react";
import { useToast } from "@/components/toaster";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { resendRepliesAction } from "./actions";
import { ConfirmDialog } from "./bot-settings";

// Reenviar las respuestas del bot que no salieron por WhatsApp en las últimas 24 horas (en la sección
// Errores de /admin/bot). El admin no las ve: solo cuántas son. Pide el código de Google
// Authenticator y queda en el historial.

const TEXTS = texts(
  {
    notSent: (n: number, hours: number) =>
      `${n === 1 ? "1 respuesta no salió" : `${n} respuestas no salieron`} en las últimas ${hours} horas.`,
    resend: "Reenviar",
    question: (n: number) => `¿Reenviar ${n === 1 ? "1 respuesta" : `${n} respuestas`}?`,
    resending: "Reenviando…",
    body: (hours: number) =>
      `El bot vuelve a enviarle a cada persona la respuesta que no le llegó, tal cual (no la ves ni se registra nada otra vez). Solo las de las últimas ${hours} horas: después, WhatsApp no deja escribirles.`,
  },
  {
    en: {
      notSent: (n, hours) => `${n === 1 ? "1 reply didn't" : `${n} replies didn't`} go out in the last ${hours} hours.`,
      resend: "Resend",
      question: (n) => `Resend ${n === 1 ? "1 reply" : `${n} replies`}?`,
      resending: "Resending…",
      body: (hours) =>
        `The bot sends each person again the reply that didn't reach them, as it was (you don't see it and nothing is recorded again). Only those from the last ${hours} hours: after that, WhatsApp doesn't allow writing to them.`,
    },
  },
);

export function ResendReplies({ pending, windowHours }: { pending: number; windowHours: number }) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <div className="space-y-2">
      {pending > 0 && (
        <div className="flex flex-col items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-danger">{t.notSent(pending, windowHours)}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg border border-danger/50 px-3 py-1.5 text-sm font-medium text-danger transition hover:bg-danger/10"
          >
            {t.resend}
          </button>
        </div>
      )}
      {open && (
        <ConfirmDialog
          title={t.question(pending)}
          action={resendRepliesAction}
          submit={t.resend}
          pending={t.resending}
          onClose={() => setOpen(false)}
          onDone={(message) => {
            setOpen(false);
            toast({ tone: "success", message, focus: true });
          }}
        >
          {t.body(windowHours)}
        </ConfirmDialog>
      )}
    </div>
  );
}
