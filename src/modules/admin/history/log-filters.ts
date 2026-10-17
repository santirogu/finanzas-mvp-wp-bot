// El historial de /admin/historial: filtros que vienen en la URL, días, textos y formatos. Sin base
// de datos (la consulta está en src/modules/admin/history/events-log.ts). Lo común con otros
// listados de admin (fechas, búsqueda, formatos) está en src/modules/admin/shared/filters.ts.

import type { AccountEventDetails, accountEvent } from "@/db/schema";
import {
  ADMIN_MAX_ROWS,
  ADMIN_PAGE_SIZE,
  ADMIN_TIMEZONE,
  addDays,
  appendDateFilter,
  dayInBogota,
  formatDateTime,
  formatHour,
  parseDateFilter,
  parseLimit,
  parseSearch,
  all,
  type DatePreset,
  type Params,
} from "../shared/filters";

export {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  addDays,
  dateFilterLabel,
  dateRange,
  dayInBogota,
  escapeLike,
  formatPhone,
  normalizeSpaces,
  searchDigits,
  type DatePreset,
} from "../shared/filters";

/** La página del historial (src/app/(app)/admin/historial). */
export const HISTORY_PATH = "/admin/historial";

/** Cuántos eventos se muestran al principio y cuántos suma "Ver más antiguos". */
export const ADMIN_LOG_PAGE_SIZE = ADMIN_PAGE_SIZE;
/** Tope de eventos en pantalla: más allá, mejor filtrar. */
export const ADMIN_LOG_MAX = ADMIN_MAX_ROWS;
/** Las fechas se muestran y filtran en la hora de Colombia. */
export const ADMIN_LOG_TIMEZONE = ADMIN_TIMEZONE;

type AccountEventType = (typeof accountEvent.$inferSelect)["type"];

/** Los tipos de evento de las cuentas que tienen su chip en los filtros. */
export const EVENT_TYPES = [
  "registered",
  "whatsapp_code_created",
  "whatsapp_linked",
  "whatsapp_unlinked",
  "whatsapp_link_failed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Los tipos que solo registra una acción del admin (/admin/usuarios y /admin/bot). */
export const ADMIN_EVENT_TYPES = [
  "login_unlocked",
  "sessions_revoked",
  "account_suspended",
  "account_reactivated",
  "account_deleted",
  "bot_claude_paused",
  "bot_claude_resumed",
  "bot_limits_changed",
  "bot_monthly_limit_changed",
  "bot_replies_resent",
] as const;

/** El chip "Acciones del admin": todo lo que hizo un admin, sea del tipo que sea. */
export const ADMIN_ACTIONS_FILTER = "admin";

/** Los chips de tipo: los de las cuentas y el de las acciones del admin. */
export const EVENT_FILTERS = [...EVENT_TYPES, ADMIN_ACTIONS_FILTER] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];

/** Nombre de cada chip de tipo. */
export const EVENT_TYPE_FILTER_LABELS: Record<EventFilter, string> = {
  registered: "Registros",
  whatsapp_code_created: "Códigos",
  whatsapp_linked: "Vinculaciones",
  whatsapp_unlinked: "Desvinculaciones",
  whatsapp_link_failed: "Intentos fallidos",
  admin: "Acciones del admin",
};

/** ¿Lo hizo un admin? Sus tipos propios y la desvinculación que hizo él. */
export function isAdminAction(entry: { type: AccountEventType; details: AccountEventDetails }): boolean {
  return (ADMIN_EVENT_TYPES as readonly string[]).includes(entry.type) || entry.details.reason === "by_admin";
}

// La desvinculación por el admin no lleva motivo: la frase ya dice quién fue.
const REASON_LABELS = new Map<AccountEventDetails["reason"], string>([
  ["by_user", "lo desvinculó la persona"],
  ["number_moved", "el número pasó a otra cuenta"],
  ["number_changed", "la cuenta vinculó otro número"],
  ["invalid_code", "código inválido o vencido"],
  ["rate_limited", "demasiados intentos"],
]);

export type LogFilters = {
  /** Vacío: todos los tipos. */
  types: EventFilter[];
  date: DatePreset;
  /** Solo con date "personalizado": días (YYYY-MM-DD) en Colombia, ambos incluidos. */
  from: string | null;
  to: string | null;
  /** Nombre, correo o número (recortado y limitado). */
  search: string;
  /** Cuántos eventos mostrar (de a ADMIN_LOG_PAGE_SIZE, hasta ADMIN_LOG_MAX). */
  limit: number;
};

export const NO_FILTERS: LogFilters = {
  types: [],
  date: "todo",
  from: null,
  to: null,
  search: "",
  limit: ADMIN_LOG_PAGE_SIZE,
};

/**
 * Los filtros de la URL, validados: lo que no se entiende se ignora (nunca se pasa crudo a la
 * consulta). El rango personalizado se ordena si viene al revés; sin ninguna fecha válida, es "todo".
 */
export function parseLogFilters(params: Params): LogFilters {
  const requested = new Set(all(params.tipo));
  const types = EVENT_FILTERS.filter((type) => requested.has(type));
  return { types, ...parseDateFilter(params), search: parseSearch(params), limit: parseLimit(params) };
}

/** La URL del historial con esos filtros (se omite lo que está en su valor por defecto). */
export function logHref(filters: LogFilters): string {
  const params = new URLSearchParams();
  for (const type of filters.types) params.append("tipo", type);
  appendDateFilter(params, filters);
  if (filters.search) params.set("q", filters.search);
  if (filters.limit > ADMIN_LOG_PAGE_SIZE) params.set("mostrar", String(filters.limit));
  const query = params.toString();
  return query ? `${HISTORY_PATH}?${query}` : HISTORY_PATH;
}

/** Cuántos filtros hay activos (cada tipo cuenta uno, la fecha y la búsqueda otro). */
export const activeFilterCount = (f: LogFilters) =>
  f.types.length + (f.date === "todo" ? 0 : 1) + (f.search ? 1 : 0);

/** Los filtros sin uno de ellos, para la ✕ de su etiqueta (vuelve a los primeros 50). */
export function withoutFilter(f: LogFilters, remove: { type: EventFilter } | "date" | "search"): LogFilters {
  const base = { ...f, limit: ADMIN_LOG_PAGE_SIZE };
  if (remove === "date") return { ...base, date: "todo", from: null, to: null };
  if (remove === "search") return { ...base, search: "" };
  return { ...base, types: f.types.filter((t) => t !== remove.type) };
}

/** Las mismas condiciones, mostrando los siguientes 50. */
export const showMore = (f: LogFilters): LogFilters => ({
  ...f,
  limit: Math.min(ADMIN_LOG_MAX, f.limit + ADMIN_LOG_PAGE_SIZE),
});

/** Fecha y hora completas en Colombia: "14 de oct de 2026, 9:41 p. m.". */
export const formatEventTime = formatDateTime;

/** Solo la hora en Colombia: "9:41 p. m." (el día va en el título del grupo). */
export const formatEventHour = formatHour;

/** "Hoy", "Ayer", "10 de octubre" o, de otro año, "25 de septiembre de 2025". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Hoy";
  if (day === addDays(today, -1)) return "Ayer";
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** Agrupa eventos (ya ordenados del más nuevo al más viejo) por día, en Colombia. */
export function groupByDay<T extends { createdAt: Date }>(entries: T[], today: string) {
  const groups: { day: string; label: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const day = dayInBogota(entry.createdAt);
    if (groups.at(-1)?.day !== day) groups.push({ day, label: dayLabel(day, today), entries: [] });
    groups.at(-1)!.entries.push(entry);
  }
  return groups;
}

/** El detalle de un evento: el motivo, el del admin al suspender, cuántas sesiones cerró y si se reconstruyó. */
export function eventDetail(details: AccountEventDetails): string {
  const parts = [];
  const reason = REASON_LABELS.get(details.reason);
  if (reason) parts.push(reason);
  if (details.note) parts.push(`motivo: ${details.note}`);
  if (details.sessions) parts.push(`${details.sessions} ${details.sessions === 1 ? "sesión" : "sesiones"}`);
  if (details.reconstructed) parts.push("reconstruido de datos anteriores");
  if (details.limits) {
    const count = new Intl.NumberFormat("es-CO").format;
    const limits = (l: { perHour: number; perDay: number }) => `${count(l.perHour)} por hora y ${count(l.perDay)} por día`;
    parts.push(`ahora ${limits(details.limits)}${details.previousLimits ? ` (antes ${limits(details.previousLimits)})` : ""}`);
  }
  if ("monthlyLimit" in details) {
    const count = new Intl.NumberFormat("es-CO").format;
    const limit = (value: number | null | undefined) => (value == null ? "sin tope" : `${count(value)} tokens al mes`);
    parts.push(`ahora ${limit(details.monthlyLimit)} (antes ${limit(details.previousMonthlyLimit)})`);
  }
  if (details.resent !== undefined) {
    parts.push(`${details.resent} ${details.resent === 1 ? "reenviada" : "reenviadas"}${details.failed ? ` · ${details.failed} no ${details.failed === 1 ? "salió" : "salieron"} otra vez` : ""}`);
  }
  return parts.join(" · ");
}
