"use client";

import Form from "next/form";
import { useId, useState, type ChangeEvent } from "react";
import { DATE_PRESETS, DATE_PRESET_LABELS, type DateFilter } from "@/modules/admin/shared/filters";

// La barra de filtros de los listados de administración: búsqueda y botón "Filtros", con un panel
// de grupos de chips. Cada listado (Historial, Usuarios…) la arma con sus propios grupos. Los
// filtros van en la URL (next/form: navega sin recargar la página). Tocar un chip aplica el filtro al
// instante; un rango personalizado se aplica con "Aplicar".

export type ChipOption = { value: string; label: string };

export type ChipGroup = {
  /** El parámetro de la URL. */
  name: string;
  legend: string;
  /** checkbox: se pueden elegir varios; radio: uno solo. */
  type: "checkbox" | "radio";
  options: readonly ChipOption[];
  selected: readonly string[];
  /** Solo en un grupo radio: la opción que abre los campos Desde y Hasta. */
  customRange?: { value: string; from: string | null; to: string | null };
};

/** El grupo de fecha estándar: Todo, Hoy, 7 días, 30 días y Personalizado. */
export function dateChipGroup(legend: string, filter: DateFilter): ChipGroup {
  return {
    name: "fecha",
    legend,
    type: "radio",
    options: DATE_PRESETS.map((preset) => ({ value: preset, label: DATE_PRESET_LABELS[preset] })),
    selected: [filter.date],
    customRange: { value: "personalizado", from: filter.from, to: filter.to },
  };
}

// Un "chip" es una casilla (o una opción) de verdad, con su etiqueta como botón redondo: se marca
// con clic, teclado o lector de pantalla, y el formulario la envía como cualquier otra.
const chip =
  "inline-flex cursor-pointer select-none items-center rounded-full border border-border px-3 py-1.5 text-sm text-muted transition has-[:checked]:border-brand/50 has-[:checked]:bg-brand/10 has-[:checked]:font-medium has-[:checked]:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40";

export function ChipFilterBar({
  action,
  search,
  searchPlaceholder,
  groups,
  activeCount,
  panelOpen,
}: {
  action: string;
  search: string;
  searchPlaceholder: string;
  groups: readonly ChipGroup[];
  activeCount: number;
  panelOpen: boolean;
}) {
  const [open, setOpen] = useState(panelOpen);
  // Qué grupos tienen el rango personalizado elegido (muestran Desde y Hasta).
  const [customOpen, setCustomOpen] = useState(
    () => new Set(groups.filter((g) => g.customRange && g.selected.includes(g.customRange.value)).map((g) => g.name)),
  );
  const panelId = useId();

  function onChange(event: ChangeEvent<HTMLFormElement>) {
    const input = event.target as unknown as HTMLInputElement;
    const group = groups.find((g) => g.name === input.name);
    if (!group) return;
    const isCustom = group.customRange?.value === input.value;
    if (group.customRange && input.type === "radio") {
      const next = new Set(customOpen);
      if (isCustom) next.add(group.name);
      else next.delete(group.name);
      setCustomOpen(next);
    }
    if (input.type === "checkbox" || (input.type === "radio" && !isCustom)) event.currentTarget.requestSubmit();
  }

  return (
    <Form action={action} scroll={false} onChange={onChange} className="space-y-3">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar</span>
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder={searchPlaceholder}
            maxLength={100}
            className="input"
          />
        </label>
        {/* Enter en la búsqueda envía el formulario. Fuera del orden de Tab: no se ve, así que el foco
            quedaría en un lugar invisible (WCAG 2.4.7). */}
        <button type="submit" tabIndex={-1} className="sr-only">
          Buscar
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={activeCount > 0 ? `Filtros (activos: ${activeCount})` : "Filtros"}
          onClick={() => setOpen(!open)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-background"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4" aria-hidden>
            <path d="M3 5h14M6 10h8M8.5 15h3" />
          </svg>
          Filtros
          {activeCount > 0 && (
            <span aria-hidden className="rounded-full bg-brand px-1.5 text-xs leading-5 text-brand-foreground">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <div id={panelId} hidden={!open} className="space-y-4 rounded-lg border border-border bg-background p-3">
        {/* Con el panel abierto, el resultado lo vuelve a mostrar abierto (no se cierra a cada clic). */}
        {open && <input type="hidden" name="panel" value="1" />}
        {groups.map((group) => (
          <fieldset key={group.name} className="space-y-2">
            <legend className="text-sm font-medium">{group.legend}</legend>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => (
                <label key={option.value} className={chip}>
                  <input
                    type={group.type}
                    name={group.name}
                    value={option.value}
                    defaultChecked={group.selected.includes(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {group.customRange && customOpen.has(group.name) && (
              <div className="flex flex-wrap items-end gap-2 pt-1">
                <label className="min-w-0 flex-1 space-y-1">
                  <span className="text-xs text-muted">Desde</span>
                  <input name="desde" type="date" defaultValue={group.customRange.from ?? ""} className="input" />
                </label>
                <label className="min-w-0 flex-1 space-y-1">
                  <span className="text-xs text-muted">Hasta</span>
                  <input name="hasta" type="date" defaultValue={group.customRange.to ?? ""} className="input" />
                </label>
                <button type="submit" className="btn-primary">
                  Aplicar
                </button>
              </div>
            )}
          </fieldset>
        ))}
      </div>
    </Form>
  );
}
