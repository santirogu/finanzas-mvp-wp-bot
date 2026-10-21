"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { generateLinkCodeAction } from "@/modules/whatsapp/actions";
import { formatPhone } from "@/modules/whatsapp/phone";

// Los ejemplos y el mensaje para el bot ("VINCULAR …") van en español: el bot todavía responde en español.
const TEXTS = texts(
  {
    intro: "Conecta tu número y registra gastos escribiendo, por ejemplo,",
    expired: "El código venció. Genera uno nuevo.",
    generating: "Generando…",
    connect: "Conectar WhatsApp",
    send: "Envía este mensaje",
    to: "al",
    toBot: "al número del bot",
    fromYours: "desde tu WhatsApp:",
    open: "Abrir WhatsApp",
    expires: (n: number) => `Vence en ${n} ${n === 1 ? "minuto" : "minutos"}. Esta tarjeta se actualiza sola cuando tu WhatsApp quede vinculado.`,
    noWhatsApp: "¿Sin WhatsApp configurado aún?",
    simulator: "Pruébalo en el simulador",
  },
  {
    en: {
      intro: "Connect your number and add expenses by writing, for example,",
      expired: "The code expired. Get a new one.",
      generating: "Generating…",
      connect: "Connect WhatsApp",
      send: "Send this message",
      to: "to",
      toBot: "to the bot's number",
      fromYours: "from your WhatsApp:",
      open: "Open WhatsApp",
      expires: (n) => `It expires in ${n} ${n === 1 ? "minute" : "minutes"}. This card updates by itself once it's linked.`,
      noWhatsApp: "No WhatsApp set up yet?",
      simulator: "Try it in the simulator",
    },
  },
);

export function WhatsAppConnect({
  botNumber,
  showSimulator,
}: {
  botNumber: string | null;
  showSimulator: boolean;
}) {
  const t = useTexts(TEXTS);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const expired = link ? new Date(link.expiresAt).getTime() <= now : false;

  // Mientras hay un código vigente, revisa cada pocos segundos si ya se vinculó.
  useEffect(() => {
    if (!link || expired) return;
    const id = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [link, expired, router]);

  function generate() {
    startTransition(async () => {
      const result = await generateLinkCodeAction();
      setError(result.ok ? null : result.error);
      setLink(result.ok ? { code: result.code, expiresAt: result.expiresAt } : null);
      setNow(Date.now());
    });
  }

  if (!link || expired) {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-muted">
          {t.intro} <em lang="es">“me compré unos zapatos de $500.000”</em>.
        </p>
        {expired && <p className="text-danger">{t.expired}</p>}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <button type="button" onClick={generate} disabled={pending} className="btn-primary w-full">
          {pending ? t.generating : t.connect}
        </button>
      </div>
    );
  }

  const message = `VINCULAR ${link.code}`;
  const minutesLeft = Math.max(1, Math.ceil((new Date(link.expiresAt).getTime() - now) / 60000));

  return (
    <div className="mt-3 space-y-3 text-sm">
      <p className="text-muted">
        {t.send}{" "}
        {botNumber ? (
          <>
            {t.to} <span className="whitespace-nowrap font-medium text-foreground">{formatPhone(botNumber)}</span>
          </>
        ) : (
          t.toBot
        )}{" "}
        {t.fromYours}
      </p>
      <p lang="es" className="rounded-lg bg-background py-3 text-center font-mono text-lg font-semibold tracking-widest">
        {message}
      </p>
      {botNumber && (
        <a
          href={`https://wa.me/${botNumber}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="btn-primary w-full"
        >
          {t.open}
        </a>
      )}
      <p className="text-xs text-muted">{t.expires(minutesLeft)}</p>
      {showSimulator && (
        <p className="text-xs text-muted">
          {t.noWhatsApp}{" "}
          <Link href="/simulador" target="_blank" className="font-medium text-brand">
            {t.simulator}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
