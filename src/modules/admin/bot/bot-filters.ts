// Bot de WhatsApp (/admin/bot): los filtros que vienen en la URL, los resultados de cada mensaje y sus
// nombres. Sin base de datos (las consultas están en src/modules/admin/bot/bot-activity.ts).
//
// El módulo muestra cómo funciona el bot, nunca lo que la gente escribe: la política de privacidad
// promete que el admin no ve los mensajes (ni sus montos). Cada mensaje cuenta por su resultado.

import { addDays, appendDateFilter, dateFilterLabel, dateRange, parseDateFilter, parseSearch, type DatePreset, type Params } from "../shared/filters";

export const BOT_PATH = "/admin/bot";

export type BotFilters = {
  /** Nombre o correo de la cuenta, o el número. */
  search: string;
  date: DatePreset;
  from: string | null;
  to: string | null;
};

export const NO_BOT_FILTERS: BotFilters = { search: "", date: "todo", from: null, to: null };

export function parseBotFilters(params: Params): BotFilters {
  return { search: parseSearch(params), ...parseDateFilter(params) };
}

/** La URL de la página con esos filtros. */
export function botHref(filters: BotFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  appendDateFilter(params, filters);
  const query = params.toString();
  return query ? `${BOT_PATH}?${query}` : BOT_PATH;
}

/** Las etiquetas de los filtros activos, cada una con la URL que lo quita. */
export function activeBotFilters(filters: BotFilters): { label: string; href: string }[] {
  return [
    ...(filters.search ? [{ label: `“${filters.search}”`, href: botHref({ ...filters, search: "" }) }] : []),
    ...(filters.date !== "todo"
      ? [{ label: dateFilterLabel(filters), href: botHref({ ...filters, date: "todo", from: null, to: null }) }]
      : []),
  ];
}

/**
 * Qué pasó con cada mensaje, en el orden en que se muestran. Sale del estado, del tipo de intención
 * y de si el número tiene cuenta (bot-activity.ts), no del texto.
 */
export const OUTCOMES = [
  "registrado",
  "comando",
  "respuesta",
  "vinculado",
  "tope_claude",
  "error",
  "vinculacion_fallida",
  "sin_vincular",
  "no_texto",
  "suspendida",
  "pendiente",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  registrado: "Registró movimientos",
  comando: "Comandos (balance, deshacer, ayuda)",
  respuesta: "Respuesta sin registrar nada",
  vinculado: "Vinculó su número",
  tope_claude: "Llegó al tope de Claude",
  error: "Error",
  vinculacion_fallida: "Código de vinculación inválido",
  sin_vincular: "Número sin vincular",
  no_texto: "No era texto (audio, foto…)",
  suspendida: "Cuenta suspendida",
  pendiente: "Sin procesar todavía",
};

/** Los resultados que piden atención (se resaltan en la página). */
export const PROBLEM_OUTCOMES: readonly Outcome[] = ["tope_claude", "error", "pendiente"];

/** Con "Todo", el gráfico de Claude por día muestra los últimos 30 días. */
export const CLAUDE_DAYS_WHEN_ALL = 30;

/** Los días del gráfico de llamadas a Claude (YYYY-MM-DD, del más viejo al más nuevo). */
export function claudeDays(filters: BotFilters, today: string): string[] {
  const range = dateRange(filters, today);
  const to = range.to && range.to < today ? range.to : today;
  const from = range.from ?? addDays(to, -(CLAUDE_DAYS_WHEN_ALL - 1));
  const days: string[] = [];
  // Tope por si un rango personalizado es enorme: el gráfico solo muestra los últimos 90 días.
  for (let day = from > addDays(to, -89) ? from : addDays(to, -89); day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Segundos para leer: "0,8 s", "12 s", "2 min". */
export function formatSeconds(seconds: number): string {
  if (seconds < 10) return `${seconds.toFixed(1).replace(".", ",")} s`;
  if (seconds < 120) return `${Math.round(seconds)} s`;
  return `${Math.round(seconds / 60)} min`;
}

/**
 * El nombre de un error del bot (la columna error: el motivo que dio Claude, el tipo de excepción o
 * lo que respondió WhatsApp al enviar). Lo técnico va aparte, como detalle.
 */
export function errorLabel(error: string): { label: string; detail: string | null } {
  const send = error.indexOf("envío: ");
  if (send >= 0) return { label: "No se pudo enviar la respuesta por WhatsApp", detail: error.slice(send + "envío: ".length) || null };
  const [reason, ...rest] = error.split(": ");
  const detail = rest.join(": ") || null;
  switch (reason) {
    case "not_configured":
      return { label: "Claude no está configurado (falta la API key)", detail };
    case "refusal":
      return { label: "Claude no quiso responder", detail };
    case "invalid_output":
      return { label: "Claude respondió en un formato que no se pudo leer", detail };
    case "api_error":
      return { label: "Error de la API de Claude", detail };
    case "":
      return { label: "Error sin detalle", detail: null };
    default:
      return { label: "Error interno de la app", detail: error };
  }
}

/** Un número para leer, con puntos de miles: "18.400" (tokens, mensajes; no es dinero). */
export const formatCount = (n: number) => new Intl.NumberFormat("es-CO").format(n);

/** Un día (YYYY-MM-DD) corto, para el gráfico: "12 oct". */
export function formatShortDay(day: string): string {
  // Por partes: el formato completo de es-CO dice "12 de oct".
  const parts = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(
    new Date(`${day}T00:00:00Z`),
  );
  const part = (type: "day" | "month") => parts.find((p) => p.type === type)!.value;
  return `${part("day")} ${part("month")}`;
}
