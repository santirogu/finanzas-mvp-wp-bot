"use client";

import { BOT_PATH, type BotFilters } from "@/modules/admin/bot/bot-filters";
import { ChipFilterBar, dateChipGroup } from "../chip-filter-bar";

/** Los filtros del bot: la cuenta o el número, y la fecha de los mensajes. */
export function BotFilterBar({ filters, panelOpen }: { filters: BotFilters; panelOpen: boolean }) {
  return (
    <ChipFilterBar
      action={BOT_PATH}
      search={filters.search}
      searchPlaceholder="Nombre, correo o número"
      activeCount={filters.date === "todo" ? 0 : 1}
      panelOpen={panelOpen}
      groups={[dateChipGroup("Fecha de los mensajes", filters)]}
    />
  );
}
