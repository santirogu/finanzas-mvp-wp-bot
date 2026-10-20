"use client";

import Link from "next/link";
import { useAppPathname } from "@/i18n/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { initialsOf } from "@/lib/text";

/**
 * El menú de la cuenta, arriba a la derecha: un círculo con las iniciales (y el escudo de admin, si lo
 * es) que abre una tarjeta con el nombre, el correo, Mi cuenta, Ayuda y Salir. Se maneja como la tarjeta del
 * selector de meses: se cierra con Escape (el foco vuelve al botón), al tocar fuera o al salir con Tab.
 *
 * Lo de admin (la etiqueta y el escudo) llega ya dibujado por el servidor, solo si tiene el rol: a una
 * cuenta normal no le llega nada de eso.
 */
export function AccountMenu({
  name,
  email,
  roleName,
  badge,
  shield,
  signOut,
}: {
  name: string;
  email: string;
  /** "admin" o "super admin", para el nombre del botón; nada para una cuenta normal. */
  roleName?: string;
  /** La etiqueta "Admin" o "Super admin" (src/components/admin-badge.tsx), o nada. */
  badge?: React.ReactNode;
  /** El escudo sobre el círculo, o nada. */
  shield?: React.ReactNode;
  /** La Server Action que cierra la sesión. */
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const cardId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pathname = useAppPathname();

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

  const item = "flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-sm pointer-fine:min-h-9";

  return (
    <div
      ref={wrapper}
      className="relative"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={cardId}
        aria-label={`Tu cuenta: ${name || email}${roleName ? `, ${roleName}` : ""}`}
        onClick={() => setOpen(!open)}
        className={`inline-flex min-h-11 items-center gap-1 rounded-full border py-1 pl-1 pr-2 transition hover:bg-background pointer-fine:min-h-0 ${open ? "border-brand" : "border-border"}`}
      >
        {/* El escudo se apoya en el contenedor y sobresale del círculo a propósito; las iniciales van
            en su propio círculo (así ningún texto se sale de su caja). */}
        <span aria-hidden className="relative size-8 shrink-0">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
            {initialsOf(name, email)}
          </span>
          {shield}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <div
        id={cardId}
        role="group"
        aria-label="Tu cuenta"
        hidden={!open}
        className="card absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] p-1.5 shadow-lg"
      >
        <div className="border-b border-border px-3 pb-3 pt-2">
          {/* El nombre completo (en dos renglones si hace falta); el correo, cortado con "…" si es muy largo. */}
          <p className="font-medium break-words">{name}</p>
          <p className="truncate text-xs text-muted" title={email}>
            {email}
          </p>
          {badge && <div className="mt-2">{badge}</div>}
        </div>
        <ul className="py-1">
          <li>
            <Link
              href="/cuenta"
              aria-current={pathname === "/cuenta" ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`${item} hover:bg-background aria-[current=page]:font-medium`}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-4.5 shrink-0 text-muted" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z"
                  clipRule="evenodd"
                />
              </svg>
              Mi cuenta
            </Link>
          </li>
          <li>
            <Link
              href="/ayuda"
              aria-current={pathname === "/ayuda" ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`${item} hover:bg-background aria-[current=page]:font-medium`}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-4.5 shrink-0 text-muted" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                  clipRule="evenodd"
                />
              </svg>
              Ayuda
            </Link>
          </li>
        </ul>
        {/* Cierra la sesión: en rojo y aparte, para no tocarlo sin querer. */}
        <form action={signOut} className="border-t border-border pt-1">
          <button type="submit" className={`${item} text-danger hover:bg-danger/10`}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4.5 shrink-0" aria-hidden>
              <path
                fillRule="evenodd"
                d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z"
                clipRule="evenodd"
              />
              <path
                fillRule="evenodd"
                d="M6 10a.75.75 0 0 1 .75-.75h9.546l-1.048-.943a.75.75 0 1 1 1.004-1.114l2.5 2.25a.75.75 0 0 1 0 1.114l-2.5 2.25a.75.75 0 1 1-1.004-1.114l1.048-.943H6.75A.75.75 0 0 1 6 10Z"
                clipRule="evenodd"
              />
            </svg>
            Salir
          </button>
        </form>
      </div>
    </div>
  );
}
