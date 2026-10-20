"use client";

import {
  ANY,
  LOCKED_FILTER,
  ROLE_FILTER_LABELS,
  SUSPENDED_FILTER,
  USERS_PATH,
  WHATSAPP_FILTER_LABELS,
  activeUserFilters,
  whatsappParam,
  type UserFilters,
} from "@/modules/admin/users/user-filters";
import { ChipFilterBar, dateChipGroup } from "../chip-filter-bar";

const ALL = { value: ANY, label: "Todos" };

/** Los filtros de Usuarios: rol, WhatsApp, estado (bloqueo, suspendida) y fecha de registro. */
export function UsersFilterBar({ filters, panelOpen }: { filters: UserFilters; panelOpen: boolean }) {
  return (
    <ChipFilterBar
      action={USERS_PATH}
      search={filters.search}
      searchPlaceholder="Nombre, correo o número"
      activeCount={activeUserFilters(filters).length}
      panelOpen={panelOpen}
      groups={[
        {
          name: "rol",
          legend: "Rol",
          type: "radio",
          options: [ALL, { value: "admin", label: ROLE_FILTER_LABELS.admin }, { value: "user", label: ROLE_FILTER_LABELS.user }],
          selected: [filters.role ?? ANY],
        },
        {
          name: "whatsapp",
          legend: "WhatsApp",
          type: "radio",
          options: [ALL, { value: "si", label: WHATSAPP_FILTER_LABELS.si }, { value: "no", label: WHATSAPP_FILTER_LABELS.no }],
          selected: [whatsappParam(filters.whatsapp)],
        },
        {
          name: "estado",
          legend: "Estado",
          type: "checkbox",
          options: [LOCKED_FILTER, SUSPENDED_FILTER],
          selected: [...(filters.locked ? [LOCKED_FILTER.value] : []), ...(filters.suspended ? [SUSPENDED_FILTER.value] : [])],
        },
        dateChipGroup("Fecha de registro", filters),
      ]}
    />
  );
}
