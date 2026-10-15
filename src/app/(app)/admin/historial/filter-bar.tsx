"use client";

import {
  EVENT_TYPES,
  EVENT_TYPE_FILTER_LABELS,
  HISTORY_PATH,
  activeFilterCount,
  type LogFilters,
} from "@/modules/admin/history/log-filters";
import { ChipFilterBar, dateChipGroup } from "../chip-filter-bar";

/** Los filtros del Historial: tipo de evento (varios a la vez) y fecha. */
export function FilterBar({ filters, panelOpen }: { filters: LogFilters; panelOpen: boolean }) {
  return (
    <ChipFilterBar
      action={HISTORY_PATH}
      search={filters.search}
      searchPlaceholder="Nombre, correo o número"
      activeCount={activeFilterCount(filters)}
      panelOpen={panelOpen}
      groups={[
        {
          name: "tipo",
          legend: "Tipo de evento",
          type: "checkbox",
          options: EVENT_TYPES.map((type) => ({ value: type, label: EVENT_TYPE_FILTER_LABELS[type] })),
          selected: filters.types,
        },
        dateChipGroup("Fecha", filters),
      ]}
    />
  );
}
