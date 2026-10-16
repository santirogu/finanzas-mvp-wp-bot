// Piezas comunes de los listados de administración (Historial, Usuarios y los que vengan): los
// parámetros de la URL, los filtros de fecha, la búsqueda y los formatos. Sin base de datos.

import { todayInTimezone } from "@/lib/dates";
import { withoutControlChars } from "@/lib/text";

/** Las fechas se muestran y filtran en la hora de Colombia. */
export const ADMIN_TIMEZONE = "America/Bogota";
/** Cuántas filas se muestran al principio y cuántas suma "Ver más". */
export const ADMIN_PAGE_SIZE = 50;
/** Tope de filas en pantalla: más allá, mejor filtrar. */
export const ADMIN_MAX_ROWS = 500;
const MAX_SEARCH_LENGTH = 100;

export type Params = Record<string, string | string[] | undefined>;

// Stryker disable next-line ConditionalExpression: [undefined] daría lo mismo (no es ningún valor válido y se lee como "")
export const all = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
export const first = (value: string | string[] | undefined) => all(value)[0] ?? "";


/** Lo máximo que puede tener una nota del admin (el motivo de una suspensión). */
export const NOTE_MAX_LENGTH = 300;

/** Una nota del admin en una línea: espacios y saltos de línea seguidos, uno solo; sin caracteres de control. */
export const cleanNote = (text: string) =>
  withoutControlChars(text.replace(/\s+/g, " ")).trim().slice(0, NOTE_MAX_LENGTH);

/** La búsqueda de la URL: sin caracteres de control ni espacios en los extremos, de máximo 100 caracteres. */
export const parseSearch = (params: Params) => withoutControlChars(first(params.q)).trim().slice(0, MAX_SEARCH_LENGTH);

/** "Ver más" suma de a 50: 50, 100, 150… hasta el tope. */
export function parseLimit(params: Params): number {
  const shown = Number(first(params.mostrar));
  return Number.isInteger(shown)
    ? Math.min(ADMIN_MAX_ROWS, Math.max(ADMIN_PAGE_SIZE, Math.ceil(shown / ADMIN_PAGE_SIZE) * ADMIN_PAGE_SIZE))
    : ADMIN_PAGE_SIZE;
}

export const DATE_PRESETS = ["todo", "hoy", "7d", "30d", "personalizado"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  todo: "Todo",
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  personalizado: "Personalizado",
};

/** El filtro de fecha: un atajo o un rango personalizado (días YYYY-MM-DD en Colombia, incluidos). */
export type DateFilter = { date: DatePreset; from: string | null; to: string | null };

/** Un día real con forma YYYY-MM-DD (no "2026-02-31", ni "2026-10", que Date también acepta). */
function validDay(value: string): string | null {
  // Stryker disable next-line Regex: los anclajes son redundantes con la comparación de abajo
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

/**
 * El filtro de fecha de la URL (fecha, desde, hasta), validado. El rango personalizado se ordena si
 * viene al revés; sin ninguna fecha válida, es "todo".
 */
export function parseDateFilter(params: Params): DateFilter {
  const preset = first(params.fecha);
  let date: DatePreset = (DATE_PRESETS as readonly string[]).includes(preset) ? (preset as DatePreset) : "todo";
  let from = date === "personalizado" ? validDay(first(params.desde)) : null;
  let to = date === "personalizado" ? validDay(first(params.hasta)) : null;
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: comparar con null siempre da false (las guardas son para los tipos) e intercambiar dos fechas iguales no cambia nada
  if (from && to && from > to) [from, to] = [to, from];
  if (date === "personalizado" && !from && !to) date = "todo";
  return { date, from, to };
}

/** Agrega el filtro de fecha a los parámetros de una URL (se omite si es "todo"). */
export function appendDateFilter(params: URLSearchParams, f: DateFilter) {
  if (f.date !== "todo") params.set("fecha", f.date);
  if (f.date === "personalizado") {
    if (f.from) params.set("desde", f.from);
    if (f.to) params.set("hasta", f.to);
  }
}

/** Un día (YYYY-MM-DD) más `days` días. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** El rango de días que cubre el filtro de fecha, contando desde `today` (en Colombia). */
export function dateRange(f: DateFilter, today: string): { from: string | null; to: string | null } {
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
export function dateFilterLabel(f: DateFilter): string {
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

// Los teléfonos completos se formatean como en el resto de la app (src/modules/whatsapp/phone.ts).
export { formatPhone } from "@/modules/whatsapp/phone";

/**
 * Espacios duros (algunas versiones de ICU los usan, p. ej. antes de "p. m.") → espacios normales,
 * para que el texto sea igual en todos los entornos.
 */
export const normalizeSpaces = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
  normalizeSpaces(new Intl.DateTimeFormat("es-CO", { timeZone: ADMIN_TIMEZONE, ...options }).format(date));

/** Fecha y hora completas en Colombia: "14 de oct de 2026, 9:41 p. m.". */
export const formatDateTime = (date: Date) =>
  format(date, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Solo la fecha en Colombia: "14 de oct de 2026". */
export const formatDate = (date: Date) => format(date, { day: "numeric", month: "short", year: "numeric" });

/** Solo la hora en Colombia: "9:41 p. m.". */
export const formatHour = (date: Date) => format(date, { hour: "numeric", minute: "2-digit" });

/** El día (YYYY-MM-DD) de un instante, en Colombia. */
export const dayInBogota = (date: Date) => todayInTimezone(ADMIN_TIMEZONE, date);
