"use client";

import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { BOT_PATH, type BotFilters } from "@/modules/admin/bot/bot-filters";
import { ChipFilterBar, dateChipGroup } from "../chip-filter-bar";

/**
 * Los filtros del bot: la cuenta o el número, y la fecha de los mensajes. El resultado (al tocar una
 * barra) y el orden de "Por cuenta" no están en la barra, pero se conservan al buscar.
 */
const TEXTS = texts(
  { search: "Nombre, correo o número", date: "Fecha de los mensajes" },
  { en: { search: "Name, email or number", date: "Message date" } },
);

export function BotFilterBar({ filters, panelOpen }: { filters: BotFilters; panelOpen: boolean }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const hidden: Record<string, string> = {};
  if (filters.outcome) hidden.resultado = filters.outcome;
  if (filters.sort !== "tokens") hidden.orden = filters.sort;
  return (
    <ChipFilterBar
      action={BOT_PATH}
      hidden={hidden}
      search={filters.search}
      searchPlaceholder={t.search}
      activeCount={filters.date === "todo" ? 0 : 1}
      panelOpen={panelOpen}
      groups={[dateChipGroup(t.date, filters, locale)]}
    />
  );
}
