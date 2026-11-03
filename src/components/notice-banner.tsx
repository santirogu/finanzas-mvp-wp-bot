"use client";

import { useState } from "react";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { noticeCookie, type NoticeTone, type VisibleNotice } from "@/modules/notice/notice";

// "Aviso general", no "Aviso": los avisos emergentes ya son la región "Avisos" (src/components/toaster.tsx).
const TEXTS = texts(
  { label: { info: "Aviso general", important: "Aviso importante" }, hide: "Ocultar este aviso" },
  { en: { label: { info: "General notice", important: "Important notice" }, hide: "Hide this notice" } },
);

const TONES = {
  info: {
    box: "border-brand/30 bg-brand/10",
    icon: "text-brand",
    // Una "i" en un círculo.
    path: "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z",
  },
  important: {
    box: "border-danger-border bg-danger-surface",
    icon: "text-danger",
    // Un triángulo con "!".
    path: "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  },
} as const;

/**
 * El aviso para todos (Configuración del admin), arriba de la app, el login y el registro. La ✕ lo oculta en este
 * navegador: guarda su versión en una cookie, así el servidor tampoco lo dibuja al recargar. Si el admin publica
 * otro (o lo cambia), tiene otra versión y vuelve a aparecer.
 */
export function NoticeBanner({ notice }: { notice: VisibleNotice }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <NoticeBox
      message={notice.message}
      tone={notice.tone}
      onHide={() => {
        document.cookie = noticeCookie(notice.version, location.protocol === "https:");
        setHidden(true);
      }}
    />
  );
}

/** Cómo se ve el aviso: en la franja (con la ✕) y en la vista previa del admin (sin ella). */
export function NoticeBox({ message, tone, onHide }: { message: string; tone: NoticeTone; onHide?: () => void }) {
  const t = useTexts(TEXTS);
  const style = TONES[tone];
  return (
    <section aria-label={t.label[tone]} className={`flex items-start gap-2 rounded-xl border py-1.5 pl-3 text-sm ${onHide ? "pr-1.5" : "pr-3"} ${style.box}`}>
      <svg viewBox="0 0 20 20" fill="currentColor" className={`mt-2 size-5 shrink-0 ${style.icon}`} aria-hidden>
        <path fillRule="evenodd" d={style.path} clipRule="evenodd" />
      </svg>
      <p className="min-w-0 flex-1 break-words py-2">{message}</p>
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          aria-label={t.hide}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-border/60 hover:text-foreground pointer-fine:mt-1 pointer-fine:size-8"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      )}
    </section>
  );
}
