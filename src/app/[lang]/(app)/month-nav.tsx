"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { type MonthNavData, yearArrows, yearGrid } from "@/lib/month-nav";

const TEXTS = texts(
  {
    prevMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    pickMonth: "Elegir un mes",
    prevYear: "Año anterior",
    nextYear: "Año siguiente",
    thisMonth: "este mes",
    withTransactions: "con movimientos",
    backToCurrent: "Volver al mes actual",
  },
  {
    en: {
      prevMonth: "Previous month",
      nextMonth: "Next month",
      pickMonth: "Choose a month",
      prevYear: "Previous year",
      nextYear: "Next year",
      thisMonth: "this month",
      withTransactions: "with transactions",
      backToCurrent: "Back to this month",
    },
  },
);

// Flechas: 44 px en pantallas táctiles (lo que recomienda Apple); con mouse, más chicas.
const ARROW = "inline-flex shrink-0 items-center justify-center rounded-lg";
const CHEVRON_LEFT =
  "M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z";
const CHEVRON_RIGHT =
  "M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z";

/**
 * El navegador de meses del Resumen, Ingresos y Egresos: "‹ Septiembre de 2026 ›" y, al tocar el
 * nombre, una tarjeta con los 12 meses del año (y flechas para cambiar de año), donde se elige
 * cualquier mes. En el Resumen el mes es el título de la página (`heading`); en Ingresos y Egresos va
 * chico, arriba del título.
 */
export function MonthNav({ nav, heading = false }: { nav: MonthNavData; heading?: boolean }) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  // El año que muestra la tarjeta: al abrirla, el del mes que se ve; sus flechas solo lo cambian aquí.
  const [year, setYear] = useState(nav.selected.year);
  const cardId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Abierta, se cierra con Escape (el foco vuelve al botón) o al tocar fuera.
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

  const arrows = yearArrows(nav, year);
  const arrowSize = heading ? "size-11 pointer-fine:size-9" : "size-11 pointer-fine:size-7";
  const toggle = (
    <button
      ref={button}
      type="button"
      aria-expanded={open}
      aria-controls={cardId}
      onClick={() => {
        setYear(nav.selected.year);
        setOpen(!open);
      }}
      className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-1.5 hover:bg-border/60 pointer-fine:min-h-0 ${heading ? "" : "text-sm font-medium text-muted hover:text-foreground"}`}
    >
      {nav.label}
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`${heading ? "size-5" : "size-4"} shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
      <Arrow link={nav.prev} label={t.prevMonth} className={arrowSize} path={CHEVRON_LEFT} />
      {/* La tarjeta se cierra si el foco sale de aquí (con Tab) o al elegir un mes. */}
      <div
        ref={wrapper}
        className="relative min-w-0"
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next && !event.currentTarget.contains(next)) setOpen(false);
        }}
      >
        {/* En un celular angosto (menos de 384 px), "Septiembre de 2026" con 24 px no deja lugar a la
            flecha "›": baja sola al renglón de abajo. */}
        {heading ? <h1 className="text-xl font-semibold tracking-tight min-[24rem]:text-2xl">{toggle}</h1> : toggle}
        <div
          id={cardId}
          role="group"
          aria-label={t.pickMonth}
          hidden={!open}
          className="card absolute left-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <YearButton year={arrows.prev} label={t.prevYear} path={CHEVRON_LEFT} onSelect={setYear} />
            {/* Al cambiar de año con las flechas, el lector de pantalla lo dice. */}
            <p aria-live="polite" className="text-sm font-semibold tabular-nums">
              {year}
            </p>
            <YearButton year={arrows.next} label={t.nextYear} path={CHEVRON_RIGHT} onSelect={setYear} />
          </div>
          <ul className="grid grid-cols-3 gap-1.5">
            {yearGrid(nav, year).map((cell) => {
              const label = `${cell.name}${cell.current ? ` (${t.thisMonth})` : ""}${cell.active ? `, ${t.withTransactions}` : ""}`;
              const look = cell.selected
                ? "bg-brand font-semibold text-brand-foreground"
                : `${cell.current ? "ring-1 ring-inset ring-control" : ""} ${cell.href ? "hover:bg-border/60" : "text-control"}`;
              // El nombre completo para el lector de pantalla, como texto: con aria-label, el nombre tendría que contener
              // la abreviatura que se ve ("ene"; WCAG 2.5.3).
              const content = (
                <>
                  <span className="sr-only">{label}</span>
                  <span aria-hidden>{cell.short}</span>
                  {cell.active && (
                    <span
                      aria-hidden
                      className={`absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full ${cell.selected ? "bg-brand-foreground" : "bg-brand"}`}
                    />
                  )}
                </>
              );
              const box = `relative flex h-11 items-center justify-center rounded-md text-sm pointer-fine:h-9 ${look}`;
              return (
                <li key={cell.name}>
                  {cell.href ? (
                    <Link
                      href={cell.href}
                      aria-current={cell.selected ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={box}
                    >
                      {content}
                    </Link>
                  ) : (
                    // Un mes futuro: se ve apagado y no se puede elegir.
                    <span role="link" aria-disabled="true" className={box}>
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <Arrow link={nav.next} label={t.nextMonth} className={arrowSize} path={CHEVRON_RIGHT} />
      {nav.backToCurrent && (
        <Link
          href={nav.backToCurrent}
          className={`inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-brand hover:bg-brand/10 pointer-fine:min-h-8 ${heading ? "sm:ml-auto" : ""}`}
        >
          {t.backToCurrent}
        </Link>
      )}
    </div>
  );
}

/** Una flecha de mes: un enlace al mes de al lado o, si no hay (enero de 2000, el actual), apagada. */
function Arrow({
  link,
  label,
  className,
  path,
}: {
  link: MonthNavData["prev"];
  label: string;
  className: string;
  path: string;
}) {
  const icon = <Chevron path={path} />;
  if (!link) {
    return (
      <span role="link" aria-disabled="true" aria-label={label} className={`${ARROW} ${className} text-control/60`}>
        {icon}
      </span>
    );
  }
  return (
    <Link
      href={link.href}
      aria-label={`${label}: ${link.name}`}
      className={`${ARROW} ${className} text-muted hover:bg-border/60 hover:text-foreground`}
    >
      {icon}
    </Link>
  );
}

/** Una flecha de año de la tarjeta: cambia el año que se muestra (sin navegar). */
function YearButton({
  year,
  label,
  path,
  onSelect,
}: {
  year: number | null;
  label: string;
  path: string;
  onSelect: (year: number) => void;
}) {
  return (
    <button
      type="button"
      disabled={year === null}
      aria-label={year === null ? label : `${label}: ${year}`}
      onClick={() => year !== null && onSelect(year)}
      className={`${ARROW} size-11 text-muted hover:bg-border/60 hover:text-foreground disabled:text-control/60 disabled:hover:bg-transparent pointer-fine:size-8`}
    >
      <Chevron path={path} />
    </button>
  );
}

function Chevron({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden>
      <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
  );
}
