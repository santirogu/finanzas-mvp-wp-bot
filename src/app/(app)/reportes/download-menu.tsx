"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Las descargas de Reportes: un botón con solo el ícono que abre la lista de lo que se puede bajar del
 * período: los movimientos en CSV (src/app/(app)/reportes/exportar/route.ts) y el reporte en PDF
 * (src/app/(app)/reportes/pdf/route.ts). Se maneja como el menú de la cuenta: se cierra con Escape (el
 * foco vuelve al botón), al tocar fuera, al salir con Tab o al elegir una descarga.
 */
export function DownloadMenu({ csvHref, pdfHref }: { csvHref: string; pdfHref: string }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
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

  const item = "flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm pointer-fine:min-h-9";

  return (
    <div
      ref={wrapper}
      className="relative shrink-0"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Descargar"
        title="Descargar"
        onClick={() => setOpen(!open)}
        className={`inline-flex size-11 items-center justify-center rounded-lg border transition hover:bg-background pointer-fine:size-9 ${open ? "border-brand" : "border-border"}`}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden>
          <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
        </svg>
      </button>

      <div
        id={listId}
        role="group"
        aria-label="Opciones de descarga"
        hidden={!open}
        className="card absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] p-1.5 shadow-lg"
      >
        <ul>
          <li>
            {/* Un enlace normal (no `Link`): es una descarga, no una página. */}
            <a href={csvHref} download onClick={() => setOpen(false)} className={`${item} hover:bg-background`}>
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-4.5 shrink-0 text-muted" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="min-w-0">
                <span className="block">Movimientos (CSV)</span>
                <span className="block text-xs text-muted">Para Excel o Google Sheets</span>
              </span>
            </a>
          </li>
          <li>
            <a href={pdfHref} download onClick={() => setOpen(false)} className={`${item} hover:bg-background`}>
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-4.5 shrink-0 text-muted" aria-hidden>
                <path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h6.879a1.5 1.5 0 0 1 1.06.44l4.122 4.12A1.5 1.5 0 0 1 17 7.622V16.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5v-13Z" />
              </svg>
              <span className="min-w-0">
                <span className="block">Reporte (PDF)</span>
                <span className="block text-xs text-muted">Para guardar o imprimir</span>
              </span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
