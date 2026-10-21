"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { simulateMessageAction } from "./actions";
import { BRAND_NAME } from "@/lib/brand";

type Bubble =
  | { from: "user"; text: string }
  | { from: "bot"; text: string; status: string; intent: string | null };

const SUGGESTIONS = [
  "ayuda",
  "balance",
  "reporte",
  "me compré unos zapatos que me costaron $500.000",
  "almuerzo 25 mil y taxi 12 mil",
  "deshacer",
];

// Formato básico de WhatsApp: *negrita* y _cursiva_.
function renderWhatsApp(text: string) {
  return text.split("\n").map((line, i) => (
    <span key={i} className="block min-h-[1em]">
      {line.split(/(\*[^*]+\*|_[^_]+_)/g).map((part, j) => {
        if (/^\*[^*]+\*$/.test(part)) return <strong key={j}>{part.slice(1, -1)}</strong>;
        if (/^_[^_]+_$/.test(part)) return <em key={j}>{part.slice(1, -1)}</em>;
        return part;
      })}
    </span>
  ));
}

export function Chat() {
  const [phone, setPhone] = useState("573001112233");
  const [text, setText] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [bubbles, pending]);

  function send(message: string) {
    const body = message.trim();
    if (!body || pending) return;
    setText("");
    setBubbles((b) => [...b, { from: "user", text: body }]);
    startTransition(async () => {
      try {
        const result = await simulateMessageAction(phone, body);
        setBubbles((b) => [
          ...b,
          { from: "bot", text: result.reply, status: result.status, intent: result.intent },
        ]);
      } catch (error) {
        setBubbles((b) => [
          ...b,
          {
            from: "bot",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            status: "error",
            intent: null,
          },
        ]);
      }
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send(text);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
      <div className="card flex h-[34rem] flex-col overflow-hidden lg:col-span-3">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
            $
          </span>
          <div>
            <p className="text-sm font-semibold">{BRAND_NAME}</p>
            <p className="text-xs text-muted">Simulación</p>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto bg-background px-4 py-4">
          {bubbles.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              Envía <strong>VINCULAR</strong> con el código de Mi cuenta, o prueba una sugerencia.
            </p>
          )}
          {bubbles.map((b, i) => (
            <div key={i} className={`flex ${b.from === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  b.from === "user"
                    ? "rounded-br-sm bg-brand text-brand-foreground"
                    : "rounded-bl-sm bg-surface"
                }`}
              >
                {renderWhatsApp(b.text)}
                {b.from === "bot" && showDebug && (
                  <details className="mt-2 text-xs text-muted">
                    <summary className="cursor-pointer">estado: {b.status}</summary>
                    {b.intent && (
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{b.intent}</pre>
                    )}
                  </details>
                )}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm text-muted">
                escribiendo…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe un mensaje"
            className="input"
            aria-label="Mensaje"
          />
          <button type="submit" disabled={pending || !text.trim()} className="btn-primary">
            Enviar
          </button>
        </form>
      </div>

      <aside className="card space-y-4 p-4 text-sm lg:col-span-2">
        <label className="block space-y-1.5">
          <span className="font-medium">Número que escribe</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input font-mono"
          />
          <span className="block text-xs text-muted">
            Formato de WhatsApp: indicativo + número, sin “+”.
          </span>
        </label>

        <div className="space-y-2">
          <p className="font-medium">Sugerencias</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={pending}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-background"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
          />
          <span>Mostrar lo que entendió el bot</span>
        </label>
      </aside>
    </div>
  );
}
