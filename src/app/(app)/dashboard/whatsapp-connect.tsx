"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { generateLinkCodeAction } from "@/modules/whatsapp/actions";

export function WhatsAppConnect({
  botNumber,
  showSimulator,
}: {
  botNumber: string | null;
  showSimulator: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<{ code: string; expiresAt: string } | null>(null);
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
      setLink(await generateLinkCodeAction());
      setNow(Date.now());
    });
  }

  if (!link || expired) {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-muted">
          Conecta tu número y registra gastos escribiendo, por ejemplo,{" "}
          <em>“me compré unos zapatos de $500.000”</em>.
        </p>
        {expired && <p className="text-expense">El código venció. Genera uno nuevo.</p>}
        <button type="button" onClick={generate} disabled={pending} className="btn-primary w-full">
          {pending ? "Generando…" : "Conectar WhatsApp"}
        </button>
      </div>
    );
  }

  const message = `VINCULAR ${link.code}`;
  const minutesLeft = Math.max(1, Math.ceil((new Date(link.expiresAt).getTime() - now) / 60000));

  return (
    <div className="mt-3 space-y-3 text-sm">
      <p className="text-muted">
        Envía este mensaje{" "}
        {botNumber ? (
          <>
            al <span className="font-medium text-foreground">+{botNumber}</span>
          </>
        ) : (
          "al número del bot"
        )}{" "}
        desde tu WhatsApp:
      </p>
      <p className="rounded-lg bg-background py-3 text-center font-mono text-lg font-semibold tracking-widest">
        {message}
      </p>
      {botNumber && (
        <a
          href={`https://wa.me/${botNumber}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="btn-primary w-full"
        >
          Abrir WhatsApp
        </a>
      )}
      <p className="text-xs text-muted">
        Vence en {minutesLeft} {minutesLeft === 1 ? "minuto" : "minutos"}. Esta tarjeta se actualiza
        sola cuando quede vinculado.
      </p>
      {showSimulator && (
        <p className="text-xs text-muted">
          ¿Sin WhatsApp configurado aún?{" "}
          <Link href="/simulador" target="_blank" className="font-medium text-brand">
            Pruébalo en el simulador
          </Link>
          .
        </p>
      )}
    </div>
  );
}
