// Usuarios (/admin/usuarios): los filtros que vienen en la URL y las rutas. Sin base de datos (las
// consultas están en src/modules/admin/users/users.ts).

import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { ROLES, type Role } from "@/lib/roles";
import {
  ADMIN_MAX_ROWS,
  ADMIN_PAGE_SIZE,
  all,
  appendDateFilter,
  dateFilterLabel,
  first,
  parseDateFilter,
  parseLimit,
  parseSearch,
  type DatePreset,
  type Params,
} from "../shared/filters";

export const USERS_PATH = "/admin/usuarios";

/** "Todos" en los grupos de una sola opción (rol y WhatsApp): sin filtro. */
export const ANY = "todos";

/** Los textos de los filtros de Usuarios en cada idioma (los valores de la URL no cambian). */
export const USER_FILTER_TEXTS = {
  es: {
    role: { admin: "Admin", user: "Usuario" } as Record<Role, string>,
    whatsapp: { si: "Vinculado", no: "Sin vincular" },
    locked: "Inicio de sesión bloqueado",
    suspended: "Suspendidas",
    rolePrefix: "Rol",
    registered: "Registro",
  },
  en: {
    role: { admin: "Admin", user: "User" } as Record<Role, string>,
    whatsapp: { si: "Linked", no: "Not linked" },
    locked: "Sign-in locked",
    suspended: "Suspended",
    rolePrefix: "Role",
    registered: "Signed up",
  },
} as const satisfies Record<Locale, unknown>;

/** El filtro de rol: el valor de la URL (rol=admin) y su chip. */
export const ROLE_FILTER_LABELS: Record<Role, string> = USER_FILTER_TEXTS.es.role;

/** El filtro de WhatsApp: whatsapp=si / whatsapp=no. */
export const WHATSAPP_FILTER_LABELS = USER_FILTER_TEXTS.es.whatsapp;

/** Los chips de estado: cuentas con el inicio de sesión bloqueado por intentos fallidos y suspendidas. */
export const LOCKED_FILTER = { value: "bloqueadas", label: USER_FILTER_TEXTS.es.locked } as const;
export const SUSPENDED_FILTER = { value: "suspendidas", label: USER_FILTER_TEXTS.es.suspended } as const;

export type UserFilters = {
  /** Nombre, correo o número de WhatsApp. */
  search: string;
  /** null: todos los roles. */
  role: Role | null;
  /** true: con WhatsApp vinculado; false: sin vincular; null: todas. */
  whatsapp: boolean | null;
  locked: boolean;
  suspended: boolean;
  /** Fecha de registro. */
  date: DatePreset;
  from: string | null;
  to: string | null;
  limit: number;
};

export const NO_USER_FILTERS: UserFilters = {
  search: "",
  role: null,
  whatsapp: null,
  locked: false,
  suspended: false,
  date: "todo",
  from: null,
  to: null,
  limit: ADMIN_PAGE_SIZE,
};

const parseWhatsApp = (value: string) => (value === "si" ? true : value === "no" ? false : null);

/** Los filtros de la URL, validados: lo que no se entiende se ignora. */
export function parseUserFilters(params: Params): UserFilters {
  const role = first(params.rol);
  return {
    search: parseSearch(params),
    role: (ROLES as readonly string[]).includes(role) ? (role as Role) : null,
    whatsapp: parseWhatsApp(first(params.whatsapp)),
    locked: all(params.estado).includes(LOCKED_FILTER.value),
    suspended: all(params.estado).includes(SUSPENDED_FILTER.value),
    ...parseDateFilter(params),
    limit: parseLimit(params),
  };
}

/** El valor de la URL del filtro de WhatsApp ("si", "no" o "todos"). */
export const whatsappParam = (whatsapp: boolean | null) => (whatsapp === null ? ANY : whatsapp ? "si" : "no");

/** La URL de Usuarios con esos filtros (se omite lo que está en su valor por defecto). */
export function usersHref(f: UserFilters): string {
  const params = new URLSearchParams();
  if (f.role) params.set("rol", f.role);
  if (f.whatsapp !== null) params.set("whatsapp", whatsappParam(f.whatsapp));
  if (f.locked) params.append("estado", LOCKED_FILTER.value);
  if (f.suspended) params.append("estado", SUSPENDED_FILTER.value);
  appendDateFilter(params, f);
  if (f.search) params.set("q", f.search);
  if (f.limit > ADMIN_PAGE_SIZE) params.set("mostrar", String(f.limit));
  const query = params.toString();
  return query ? `${USERS_PATH}?${query}` : USERS_PATH;
}

export type UserFilterKey = "role" | "whatsapp" | "locked" | "suspended" | "date" | "search";

/** Los filtros sin uno de ellos, para la ✕ de su etiqueta (vuelve a las primeras 50 cuentas). */
export function withoutUserFilter(f: UserFilters, key: UserFilterKey): UserFilters {
  const base = { ...f, limit: ADMIN_PAGE_SIZE };
  switch (key) {
    case "role":
      return { ...base, role: null };
    case "whatsapp":
      return { ...base, whatsapp: null };
    case "locked":
      return { ...base, locked: false };
    case "suspended":
      return { ...base, suspended: false };
    case "date":
      return { ...base, date: "todo", from: null, to: null };
    default:
      return { ...base, search: "" };
  }
}

/** Los filtros activos, en el orden de las etiquetas, con su texto (en el idioma de la página). */
export function activeUserFilters(f: UserFilters, locale: Locale = DEFAULT_LOCALE): { key: UserFilterKey; label: string }[] {
  const t = USER_FILTER_TEXTS[locale];
  const items: { key: UserFilterKey; label: string }[] = [];
  if (f.role) items.push({ key: "role", label: `${t.rolePrefix}: ${t.role[f.role]}` });
  if (f.whatsapp !== null) {
    items.push({ key: "whatsapp", label: `WhatsApp: ${t.whatsapp[f.whatsapp ? "si" : "no"].toLowerCase()}` });
  }
  if (f.locked) items.push({ key: "locked", label: t.locked });
  if (f.suspended) items.push({ key: "suspended", label: t.suspended });
  if (f.date !== "todo") items.push({ key: "date", label: `${t.registered}: ${dateFilterLabel(f, locale)}` });
  if (f.search) items.push({ key: "search", label: `“${f.search}”` });
  return items;
}

/** Las mismas condiciones, mostrando las siguientes 50 cuentas. */
export const showMoreUsers = (f: UserFilters): UserFilters => ({
  ...f,
  limit: Math.min(ADMIN_MAX_ROWS, f.limit + ADMIN_PAGE_SIZE),
});

/** Los ids de cuenta (Better Auth y los de prueba): letras, números, guiones; nada más llega a la consulta. */
export const isValidUserId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export const userDetailHref = (id: string) => `${USERS_PATH}/${encodeURIComponent(id)}`;
