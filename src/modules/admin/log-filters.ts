// La lista de eventos de /admin: filtros que vienen en la URL, textos y formatos. Sin dependencias
// (lo que toca la base está en src/modules/admin/events-log.ts).

import type { AccountEventDetails } from "@/db/schema";

export const ADMIN_LOG_PAGE_SIZE = 50;
/** Las fechas de la lista se muestran y filtran en la hora de Colombia. */
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

export const EVENT_LABELS: Record<EventType, string> = {
  registered: "Registro",
  whatsapp_code_created: "Código para vincular",
  whatsapp_linked: "WhatsApp vinculado",
  whatsapp_unlinked: "WhatsApp desvinculado",
  whatsapp_link_failed: "Intento fallido de vinculación",
};

const REASON_LABELS: Record<NonNullable<AccountEventDetails["reason"]>, string> = {
  by_user: "lo desvinculó la persona",
  number_moved: "el número pasó a otra cuenta",
  number_changed: "la cuenta vinculó otro número",
  invalid_code: "código inválido o vencido",
  rate_limited: "demasiados intentos",
};

export type LogFilters = {
  type: EventType | null;
  /** Nombre, correo o número (recortado y limitado). */
  search: string;
  /** Días (YYYY-MM-DD) en la hora de Colombia, ambos incluidos. */
  from: string | null;
  to: string | null;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

/** Un día real con forma YYYY-MM-DD (no "2026-02-31"). */
function validDay(value: string): string | null {
  // Sin esto, "2026-10" o "2026" pasarían como días (Date los acepta). Los anclajes ^ y $ son
  // redundantes con la comparación de abajo, pero dejan clara la forma esperada.
  // Stryker disable next-line Regex: equivalentes por la comparación con toISOString
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

/**
 * Los filtros de la URL, validados: lo que no se entiende se ignora (nunca se pasa crudo a la
 * consulta). Si las fechas vienen al revés, se ordenan.
 */
export function parseLogFilters(params: Params): LogFilters {
  const rawType = first(params.tipo);
  const type = (EVENT_TYPES as readonly string[]).includes(rawType) ? (rawType as EventType) : null;
  const search = first(params.q).trim().slice(0, MAX_SEARCH_LENGTH);
  let from = validDay(first(params.desde));
  let to = validDay(first(params.hasta));
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: comparar con null siempre da false (las guardas son para los tipos) e intercambiar dos fechas iguales no cambia nada
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number(first(params.pagina));
  return { type, search, from, to, page: Number.isInteger(page) && page > 0 ? page : 1 };
}

/** La URL de la lista con esos filtros (y la página, si no es la primera). */
export function logHref(filters: LogFilters, page = filters.page): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("tipo", filters.type);
  if (filters.search) params.set("q", filters.search);
  if (filters.from) params.set("desde", filters.from);
  if (filters.to) params.set("hasta", filters.to);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

export const hasFilters = (f: LogFilters) => Boolean(f.type || f.search || f.from || f.to);

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

/** Fecha y hora en Colombia: "14 de oct de 2026, 9:41 p. m.". */
export function formatEventTime(date: Date): string {
  return normalizeSpaces(
    new Intl.DateTimeFormat("es-CO", {
      timeZone: ADMIN_LOG_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
  );
}

/** El detalle de un evento para la lista: el motivo y si se reconstruyó. */
export function eventDetail(details: AccountEventDetails): string {
  const parts = [];
  if (details.reason && details.reason in REASON_LABELS) parts.push(REASON_LABELS[details.reason]);
  if (details.reconstructed) parts.push("reconstruido de datos anteriores");
  return parts.join(" · ");
}
