"use client";

import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import {
  EVENT_FILTERS,
  EVENT_TYPE_FILTER_TEXTS,
  HISTORY_PATH,
  activeFilterCount,
  type LogFilters,
} from "@/modules/admin/history/log-filters";
import { ChipFilterBar, dateChipGroup } from "../chip-filter-bar";

const TEXTS = texts(
  { search: "Nombre, correo o número", type: "Tipo de evento", date: "Fecha" },
  { en: { search: "Name, email or number", type: "Event type", date: "Date" } },
);

/** Los filtros del Historial: tipo de evento (varios a la vez, también las acciones del admin) y fecha. */
export function FilterBar({ filters, panelOpen }: { filters: LogFilters; panelOpen: boolean }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  return (
    <ChipFilterBar
      action={HISTORY_PATH}
      search={filters.search}
      searchPlaceholder={t.search}
      activeCount={activeFilterCount(filters)}
      panelOpen={panelOpen}
      groups={[
        {
          name: "tipo",
          legend: t.type,
          type: "checkbox",
          options: EVENT_FILTERS.map((type) => ({ value: type, label: EVENT_TYPE_FILTER_TEXTS[locale][type] })),
          selected: filters.types,
        },
        dateChipGroup(t.date, filters, locale),
      ]}
    />
  );
}
