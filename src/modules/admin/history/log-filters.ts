// El historial de /admin/historial: filtros que vienen en la URL, días, textos y formatos. Sin base
// de datos (la consulta está en src/modules/admin/history/events-log.ts).

import type { AccountEventDetails } from "@/db/schema";
import { todayInTimezone } from "@/lib/dates";

/** La página del historial (src/app/(app)/admin/historial). */
export const HISTORY_PATH = "/admin/historial";

/** Cuántos eventos se muestran al principio y cuántos suma "Ver más antiguos". */
export const ADMIN_LOG_PAGE_SIZE = 50;
/** Tope de eventos en pantalla: más allá, mejor filtrar. */
export const ADMIN_LOG_MAX = 500;
/** Las fechas se muestran y filtran en la hora de Colombia. */
export const ADMIN_LOG_TIMEZONE = "America/Bogota";
const MAX_SEARCH_LENGTH = 100;

export const EVENT_TYPES = [
  "registered",
  "whatsapp_code_created",
  "whatsapp_linked",
  "whatsapp_unlinked",
  "whatsapp_link_failed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Nombre de cada tipo en los filtros. */
export const EVENT_TYPE_FILTER_LABELS: Record<EventType, string> = {
  registered: "Registros",
  whatsapp_code_created: "Códigos",
  whatsapp_linked: "Vinculaciones",
  whatsapp_unlinked: "Desvinculaciones",
  whatsapp_link_failed: "Intentos fallidos",
};

export const DATE_PRESETS = ["todo", "hoy", "7d", "30d", "personalizado"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  todo: "Todo",
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  personalizado: "Personalizado",
};

const REASON_LABELS: Record<NonNullable<AccountEventDetails["reason"]>, string> = {
  by_user: "lo desvinculó la persona",
  number_moved: "el número pasó a otra cuenta",
  number_changed: "la cuenta vinculó otro número",
  invalid_code: "código inválido o vencido",
  rate_limited: "demasiados intentos",
};

export type LogFilters = {
  /** Vacío: todos los tipos. */
  types: EventType[];
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

type Params = Record<string, string | string[] | undefined>;

// Stryker disable next-line ConditionalExpression: [undefined] daría lo mismo (no es ningún tipo y se lee como "")
const all = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
const first = (value: string | string[] | undefined) => all(value)[0] ?? "";

/** Un día real con forma YYYY-MM-DD (no "2026-02-31", ni "2026-10", que Date también acepta). */
function validDay(value: string): string | null {
  // Stryker disable next-line Regex: los anclajes son redundantes con la comparación de abajo
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

/**
 * Los filtros de la URL, validados: lo que no se entiende se ignora (nunca se pasa crudo a la
 * consulta). El rango personalizado se ordena si viene al revés; sin ninguna fecha válida, es "todo".
 */
export function parseLogFilters(params: Params): LogFilters {
  const requested = new Set(all(params.tipo));
  const types = EVENT_TYPES.filter((type) => requested.has(type));
  const search = first(params.q).trim().slice(0, MAX_SEARCH_LENGTH);

  const preset = first(params.fecha);
  let date: DatePreset = (DATE_PRESETS as readonly string[]).includes(preset) ? (preset as DatePreset) : "todo";
  let from = date === "personalizado" ? validDay(first(params.desde)) : null;
  let to = date === "personalizado" ? validDay(first(params.hasta)) : null;
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: comparar con null siempre da false (las guardas son para los tipos) e intercambiar dos fechas iguales no cambia nada
  if (from && to && from > to) [from, to] = [to, from];
  if (date === "personalizado" && !from && !to) date = "todo";

  // "Ver más antiguos" suma de a 50: 50, 100, 150… hasta el tope.
  const shown = Number(first(params.mostrar));
  const limit = Number.isInteger(shown)
    ? Math.min(ADMIN_LOG_MAX, Math.max(ADMIN_LOG_PAGE_SIZE, Math.ceil(shown / ADMIN_LOG_PAGE_SIZE) * ADMIN_LOG_PAGE_SIZE))
    : ADMIN_LOG_PAGE_SIZE;

  return { types, date, from, to, search, limit };
}

/** La URL del historial con esos filtros (se omite lo que está en su valor por defecto). */
export function logHref(filters: LogFilters): string {
  const params = new URLSearchParams();
  for (const type of filters.types) params.append("tipo", type);
  if (filters.date !== "todo") params.set("fecha", filters.date);
  if (filters.date === "personalizado") {
    if (filters.from) params.set("desde", filters.from);
    if (filters.to) params.set("hasta", filters.to);
  }
  if (filters.search) params.set("q", filters.search);
  if (filters.limit > ADMIN_LOG_PAGE_SIZE) params.set("mostrar", String(filters.limit));
  const query = params.toString();
  return query ? `${HISTORY_PATH}?${query}` : HISTORY_PATH;
}

/** Cuántos filtros hay activos (cada tipo cuenta uno, la fecha y la búsqueda otro). */
export const activeFilterCount = (f: LogFilters) =>
  f.types.length + (f.date === "todo" ? 0 : 1) + (f.search ? 1 : 0);

/** Los filtros sin uno de ellos, para la ✕ de su etiqueta (vuelve a los primeros 50). */
export function withoutFilter(f: LogFilters, remove: { type: EventType } | "date" | "search"): LogFilters {
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

/** Un día (YYYY-MM-DD) más `days` días. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** El rango de días que cubre el filtro de fecha, contando desde `today` (en Colombia). */
export function dateRange(f: LogFilters, today: string): { from: string | null; to: string | null } {
  switch (f.date) {
    case "hoy":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "personalizado":
      return { from: f.from, to: f.to };
    default:
      return { from: null, to: null };
  }
}

const shortDay = (day: string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );

/** El texto de la etiqueta del filtro de fecha: "Hoy", "Últimos 7 días", "1 de oct – 15 de oct"… */
export function dateFilterLabel(f: LogFilters): string {
  if (f.date !== "personalizado") return DATE_PRESET_LABELS[f.date];
  if (f.from && f.to) return f.from === f.to ? shortDay(f.from) : `${shortDay(f.from)} – ${shortDay(f.to)}`;
  return f.from ? `Desde el ${shortDay(f.from)}` : `Hasta el ${shortDay(f.to!)}`;
}

/** Para buscar con ILIKE sin que % o _ del texto funcionen como comodines. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Los dígitos de lo que se busca, para encontrar números escritos con espacios o "+". */
export const searchDigits = (search: string) => search.replace(/\D/g, "");

/** "573001112233" → "+57 300 111 2233" (completo: solo lo ve el admin). */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length === 12) {
    return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return `+${digits}`;
}

/**
 * Espacios duros (algunas versiones de ICU los usan, p. ej. antes de "p. m.") → espacios normales,
 * para que el texto sea igual en todos los entornos.
 */
export const normalizeSpaces = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
  normalizeSpaces(new Intl.DateTimeFormat("es-CO", { timeZone: ADMIN_LOG_TIMEZONE, ...options }).format(date));

/** Fecha y hora completas en Colombia: "14 de oct de 2026, 9:41 p. m.". */
export const formatEventTime = (date: Date) =>
  format(date, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Solo la hora en Colombia: "9:41 p. m." (el día va en el título del grupo). */
export const formatEventHour = (date: Date) => format(date, { hour: "numeric", minute: "2-digit" });

/** El día (YYYY-MM-DD) de un instante, en Colombia. */
export const dayInBogota = (date: Date) => todayInTimezone(ADMIN_LOG_TIMEZONE, date);

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

/** El detalle de un evento: el motivo y si se reconstruyó. */
export function eventDetail(details: AccountEventDetails): string {
  const parts = [];
  if (details.reason && details.reason in REASON_LABELS) parts.push(REASON_LABELS[details.reason]);
  if (details.reconstructed) parts.push("reconstruido de datos anteriores");
  return parts.join(" · ");
}
