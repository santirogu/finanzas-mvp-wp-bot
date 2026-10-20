"use client";

import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import {
  ANY,
  LOCKED_FILTER,
  SUSPENDED_FILTER,
  USER_FILTER_TEXTS,
  USERS_PATH,
  activeUserFilters,
  whatsappParam,
  type UserFilters,
} from "@/modules/admin/users/user-filters";
import { ChipFilterBar, dateChipGroup } from "../chip-filter-bar";

const TEXTS = texts(
  { all: "Todos", search: "Nombre, correo o número", role: "Rol", state: "Estado", date: "Fecha de registro" },
  { en: { all: "All", search: "Name, email or number", role: "Role", state: "Status", date: "Sign-up date" } },
);

/** Los filtros de Usuarios: rol, WhatsApp, estado (bloqueo, suspendida) y fecha de registro. */
export function UsersFilterBar({ filters, panelOpen }: { filters: UserFilters; panelOpen: boolean }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const labels = USER_FILTER_TEXTS[locale];
  const all = { value: ANY, label: t.all };
  return (
    <ChipFilterBar
      action={USERS_PATH}
      search={filters.search}
      searchPlaceholder={t.search}
      activeCount={activeUserFilters(filters).length}
      panelOpen={panelOpen}
      groups={[
        {
          name: "rol",
          legend: t.role,
          type: "radio",
          options: [all, { value: "admin", label: labels.role.admin }, { value: "user", label: labels.role.user }],
          selected: [filters.role ?? ANY],
        },
        {
          name: "whatsapp",
          legend: "WhatsApp",
          type: "radio",
          options: [all, { value: "si", label: labels.whatsapp.si }, { value: "no", label: labels.whatsapp.no }],
          selected: [whatsappParam(filters.whatsapp)],
        },
        {
          name: "estado",
          legend: t.state,
          type: "checkbox",
          options: [
            { value: LOCKED_FILTER.value, label: labels.locked },
            { value: SUSPENDED_FILTER.value, label: labels.suspended },
          ],
          selected: [...(filters.locked ? [LOCKED_FILTER.value] : []), ...(filters.suspended ? [SUSPENDED_FILTER.value] : [])],
        },
        dateChipGroup(t.date, filters, locale),
      ]}
    />
  );
}
