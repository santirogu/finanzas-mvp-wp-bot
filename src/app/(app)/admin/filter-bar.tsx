"use client";

import Form from "next/form";
import { useId, useState, type ChangeEvent } from "react";
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  EVENT_TYPES,
  EVENT_TYPE_FILTER_LABELS,
  activeFilterCount,
  type LogFilters,
} from "@/modules/admin/log-filters";

// Un "chip" es una casilla (o una opción) de verdad, con su etiqueta como botón redondo: se marca
// con clic, teclado o lector de pantalla, y el formulario la envía como cualquier otra.
const chip =
  "inline-flex cursor-pointer select-none items-center rounded-full border border-border px-3 py-1.5 text-sm text-muted transition has-[:checked]:border-brand/50 has-[:checked]:bg-brand/10 has-[:checked]:font-medium has-[:checked]:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40";

/**
 * Búsqueda y botón "Filtros", con el panel de tipo de evento y fecha. Los filtros van en la URL
 * (next/form: navega sin recargar la página). Tocar un chip aplica el filtro al instante; el rango
 * personalizado se aplica con "Aplicar".
 */
export function FilterBar({ filters, panelOpen }: { filters: LogFilters; panelOpen: boolean }) {
  const [open, setOpen] = useState(panelOpen);
  const [date, setDate] = useState(filters.date);
  const panelId = useId();
  const count = activeFilterCount(filters);

  function onChange(event: ChangeEvent<HTMLFormElement>) {
    const input = event.target as unknown as HTMLInputElement;
    if (input.name === "fecha") setDate(input.value as LogFilters["date"]);
    const instant = input.type === "checkbox" || (input.type === "radio" && input.value !== "personalizado");
    if (instant) event.currentTarget.requestSubmit();
  }

  return (
    <Form action="/admin" scroll={false} onChange={onChange} className="space-y-3">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar</span>
          <input
            name="q"
            type="search"
            defaultValue={filters.search}
            placeholder="Nombre, correo o número"
            maxLength={100}
            className="input"
          />
        </label>
        {/* Enter en la búsqueda envía el formulario. */}
        <button type="submit" className="sr-only">
          Buscar
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={count > 0 ? `Filtros (activos: ${count})` : "Filtros"}
          onClick={() => setOpen(!open)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-background"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4" aria-hidden>
            <path d="M3 5h14M6 10h8M8.5 15h3" />
          </svg>
          Filtros
          {count > 0 && (
            <span aria-hidden className="rounded-full bg-brand px-1.5 text-xs leading-5 text-brand-foreground">
              {count}
            </span>
          )}
        </button>
      </div>

      <div id={panelId} hidden={!open} className="space-y-4 rounded-lg border border-border bg-background p-3">
        {/* Con el panel abierto, el resultado lo vuelve a mostrar abierto (no se cierra a cada clic). */}
        {open && <input type="hidden" name="panel" value="1" />}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Tipo de evento</legend>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((type) => (
              <label key={type} className={chip}>
                <input type="checkbox" name="tipo" value={type} defaultChecked={filters.types.includes(type)} className="sr-only" />
                {EVENT_TYPE_FILTER_LABELS[type]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Fecha</legend>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => (
              <label key={preset} className={chip}>
                <input type="radio" name="fecha" value={preset} defaultChecked={filters.date === preset} className="sr-only" />
                {DATE_PRESET_LABELS[preset]}
              </label>
            ))}
          </div>
          {date === "personalizado" && (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <label className="min-w-0 flex-1 space-y-1">
                <span className="text-xs text-muted">Desde</span>
                <input name="desde" type="date" defaultValue={filters.from ?? ""} className="input" />
              </label>
              <label className="min-w-0 flex-1 space-y-1">
                <span className="text-xs text-muted">Hasta</span>
                <input name="hasta" type="date" defaultValue={filters.to ?? ""} className="input" />
              </label>
              <button type="submit" className="btn-primary">
                Aplicar
              </button>
            </div>
          )}
        </fieldset>
      </div>
    </Form>
  );
}
