// El historial de /admin/historial: filtros que vienen en la URL, días, textos y formatos. Sin base
// de datos (la consulta está en src/modules/admin/history/events-log.ts). Lo común con otros
// listados de admin (fechas, búsqueda, formatos) está en src/modules/admin/shared/filters.ts.

import type { AccountEventDetails, accountEvent } from "@/db/schema";
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
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

/** La página del historial (src/app/[lang]/(app)/admin/historial). */
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

/** Los tipos que solo registra una acción del admin (/admin/usuarios, también del super admin, y /admin/bot). */
export const ADMIN_EVENT_TYPES = [
  "login_unlocked",
  "sessions_revoked",
  "account_suspended",
  "account_reactivated",
  "account_deleted",
  "admin_granted",
  "admin_revoked",
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

/** Nombre de cada chip de tipo, en cada idioma. */
export const EVENT_TYPE_FILTER_TEXTS: Readonly<Record<Locale, Record<EventFilter, string>>> = {
  es: {
    registered: "Registros",
    whatsapp_code_created: "Códigos",
    whatsapp_linked: "Vinculaciones",
    whatsapp_unlinked: "Desvinculaciones",
    whatsapp_link_failed: "Intentos fallidos",
    admin: "Acciones del admin",
  },
  en: {
    registered: "Sign-ups",
    whatsapp_code_created: "Codes",
    whatsapp_linked: "Links",
    whatsapp_unlinked: "Unlinks",
    whatsapp_link_failed: "Failed attempts",
    admin: "Admin actions",
  },
};

/** En español (el de siempre). */
export const EVENT_TYPE_FILTER_LABELS = EVENT_TYPE_FILTER_TEXTS.es;

/** ¿Lo hizo un admin? Sus tipos propios y la desvinculación que hizo él. */
export function isAdminAction(entry: { type: AccountEventType; details: AccountEventDetails }): boolean {
  return (ADMIN_EVENT_TYPES as readonly string[]).includes(entry.type) || entry.details.reason === "by_admin";
}

// La desvinculación por el admin no lleva motivo: la frase ya dice quién fue.
const REASON_LABELS: Readonly<Record<Locale, ReadonlyMap<AccountEventDetails["reason"], string>>> = {
  es: new Map([
    ["by_user", "lo desvinculó la persona"],
    ["number_moved", "el número pasó a otra cuenta"],
    ["number_changed", "la cuenta vinculó otro número"],
    ["invalid_code", "código inválido o vencido"],
    ["rate_limited", "demasiados intentos"],
  ]),
  en: new Map([
    ["by_user", "the person unlinked it"],
    ["number_moved", "the number moved to another account"],
    ["number_changed", "the account linked another number"],
    ["invalid_code", "invalid or expired code"],
    ["rate_limited", "too many attempts"],
  ]),
};

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

/** Fecha y hora completas en Colombia: "14 de oct de 2026, 9:41 p. m." (en inglés, "Oct 14, 2026, 9:41 PM"). */
export const formatEventTime = formatDateTime;

/** Solo la hora en Colombia: "9:41 p. m." (el día va en el título del grupo). */
export const formatEventHour = formatHour;

/**
 * "Hoy", "Ayer", "10 de octubre" o, de otro año, "25 de septiembre de 2025" (en inglés, "Today",
 * "Yesterday", "October 10", "September 25, 2025").
 */
export function dayLabel(day: string, today: string, locale: Locale = DEFAULT_LOCALE): string {
  const es = locale === "es";
  if (day === today) return es ? "Hoy" : "Today";
  if (day === addDays(today, -1)) return es ? "Ayer" : "Yesterday";
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** Agrupa eventos (ya ordenados del más nuevo al más viejo) por día, en Colombia. */
export function groupByDay<T extends { createdAt: Date }>(entries: T[], today: string, locale: Locale = DEFAULT_LOCALE) {
  const groups: { day: string; label: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const day = dayInBogota(entry.createdAt);
    if (groups.at(-1)?.day !== day) groups.push({ day, label: dayLabel(day, today, locale), entries: [] });
    groups.at(-1)!.entries.push(entry);
  }
  return groups;
}

const DETAIL_TEXTS = {
  es: {
    note: (note: string) => `motivo: ${note}`,
    sessions: (n: number) => `${n} ${n === 1 ? "sesión" : "sesiones"}`,
    reconstructed: "reconstruido de datos anteriores",
    limits: (perHour: string, perDay: string) => `${perHour} por hora y ${perDay} por día`,
    noLimit: "sin tope",
    monthly: (tokens: string) => `${tokens} tokens al mes`,
    change: (now: string, before: string | null) => `ahora ${now}${before === null ? "" : ` (antes ${before})`}`,
    resent: (n: number) => `${n} ${n === 1 ? "reenviada" : "reenviadas"}`,
    failedAgain: (n: number) => `${n} no ${n === 1 ? "salió" : "salieron"} otra vez`,
  },
  en: {
    note: (note: string) => `reason: ${note}`,
    sessions: (n: number) => `${n} ${n === 1 ? "session" : "sessions"}`,
    reconstructed: "rebuilt from earlier data",
    limits: (perHour: string, perDay: string) => `${perHour} per hour and ${perDay} per day`,
    noLimit: "no limit",
    monthly: (tokens: string) => `${tokens} tokens a month`,
    change: (now: string, before: string | null) => `now ${now}${before === null ? "" : ` (before ${before})`}`,
    resent: (n: number) => `${n} resent`,
    failedAgain: (n: number) => `${n} didn't go out again`,
  },
} as const satisfies Record<Locale, unknown>;

/** El detalle de un evento: el motivo, el del admin al suspender, cuántas sesiones cerró y si se reconstruyó. */
export function eventDetail(details: AccountEventDetails, locale: Locale = DEFAULT_LOCALE): string {
  const t = DETAIL_TEXTS[locale];
  const count = new Intl.NumberFormat(INTL_LOCALES[locale]).format;
  const parts = [];
  const reason = REASON_LABELS[locale].get(details.reason);
  if (reason) parts.push(reason);
  if (details.note) parts.push(t.note(details.note));
  if (details.sessions) parts.push(t.sessions(details.sessions));
  if (details.reconstructed) parts.push(t.reconstructed);
  if (details.limits) {
    const limits = (l: { perHour: number; perDay: number }) => t.limits(count(l.perHour), count(l.perDay));
    parts.push(t.change(limits(details.limits), details.previousLimits ? limits(details.previousLimits) : null));
  }
  if ("monthlyLimit" in details) {
    const limit = (value: number | null | undefined) => (value == null ? t.noLimit : t.monthly(count(value)));
    parts.push(t.change(limit(details.monthlyLimit), limit(details.previousMonthlyLimit)));
  }
  if (details.resent !== undefined) {
    parts.push(`${t.resent(details.resent)}${details.failed ? ` · ${t.failedAgain(details.failed)}` : ""}`);
  }
  return parts.join(" · ");
}
