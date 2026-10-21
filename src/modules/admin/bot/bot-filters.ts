// Bot de WhatsApp (/admin/bot): los filtros que vienen en la URL, los resultados de cada mensaje y sus
// nombres. Sin base de datos (las consultas están en src/modules/admin/bot/bot-activity.ts).
//
// El módulo muestra cómo funciona el bot, nunca lo que la gente escribe: la política de privacidad
// promete que el admin no ve los mensajes (ni sus montos). Cada mensaje cuenta por su resultado.

import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { todayInTimezone } from "@/lib/dates";
import {
  ADMIN_MAX_ROWS,
  ADMIN_PAGE_SIZE,
  ADMIN_TIMEZONE,
  addDays,
  appendDateFilter,
  dateFilterLabel,
  dateRange,
  first,
  parseDateFilter,
  parseLimit,
  parseSearch,
  type DatePreset,
  type Params,
} from "../shared/filters";

export const BOT_PATH = "/admin/bot";

/** Cómo se ordena la tabla "Por cuenta" (?orden=); por defecto, de la que más tokens usa. */
export const ACCOUNT_SORTS = ["tokens", "mensajes", "errores", "ultimo"] as const;
export type AccountSort = (typeof ACCOUNT_SORTS)[number];
export const ACCOUNT_SORT_TEXTS: Readonly<Record<Locale, Record<AccountSort, string>>> = {
  es: { tokens: "Tokens", mensajes: "Mensajes", errores: "Errores", ultimo: "Último mensaje" },
  en: { tokens: "Tokens", mensajes: "Messages", errores: "Errors", ultimo: "Last message" },
};
/** En español (el de siempre). */
export const ACCOUNT_SORT_LABELS = ACCOUNT_SORT_TEXTS.es;

export type BotFilters = {
  /** Nombre o correo de la cuenta, o el número. */
  search: string;
  date: DatePreset;
  from: string | null;
  to: string | null;
  /** Solo los mensajes con ese resultado (?resultado=, al tocar una barra); null: todos. */
  outcome: Outcome | null;
  sort: AccountSort;
  /** Cuántas cuentas se ven en "Por cuenta" (?mostrar=, "Ver más" suma de a ADMIN_PAGE_SIZE). */
  limit: number;
};

export const NO_BOT_FILTERS: BotFilters = {
  search: "",
  date: "todo",
  from: null,
  to: null,
  outcome: null,
  sort: "tokens",
  limit: ADMIN_PAGE_SIZE,
};

export function parseBotFilters(params: Params): BotFilters {
  const outcome = first(params.resultado);
  const sort = first(params.orden);
  return {
    search: parseSearch(params),
    ...parseDateFilter(params),
    outcome: (OUTCOMES as readonly string[]).includes(outcome) ? (outcome as Outcome) : null,
    sort: (ACCOUNT_SORTS as readonly string[]).includes(sort) ? (sort as AccountSort) : "tokens",
    limit: parseLimit(params),
  };
}

/** La URL de la página con esos filtros. */
export function botHref(filters: BotFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.outcome) params.set("resultado", filters.outcome);
  appendDateFilter(params, filters);
  if (filters.sort !== "tokens") params.set("orden", filters.sort);
  if (filters.limit > ADMIN_PAGE_SIZE) params.set("mostrar", String(filters.limit));
  const query = params.toString();
  return query ? `${BOT_PATH}?${query}` : BOT_PATH;
}

/**
 * Las etiquetas de los filtros activos, cada una con la URL que lo quita. Quitar uno vuelve a la
 * primera página de "Por cuenta": con otros filtros, las cuentas son otras.
 */
export function activeBotFilters(filters: BotFilters, locale: Locale = DEFAULT_LOCALE): { label: string; href: string }[] {
  const base = { ...filters, limit: ADMIN_PAGE_SIZE };
  const result = locale === "es" ? "Resultado" : "Result";
  return [
    ...(filters.search ? [{ label: `“${filters.search}”`, href: botHref({ ...base, search: "" }) }] : []),
    ...(filters.outcome
      ? [{ label: `${result}: ${OUTCOME_TEXTS[locale][filters.outcome]}`, href: botHref({ ...base, outcome: null }) }]
      : []),
    ...(filters.date !== "todo"
      ? [{ label: dateFilterLabel(filters, locale), href: botHref({ ...base, date: "todo", from: null, to: null }) }]
      : []),
  ];
}

/** Al tocar una barra: filtra por ese resultado, o lo quita si ya era ese. */
export const toggleOutcome = (filters: BotFilters, outcome: Outcome): BotFilters => ({
  ...filters,
  outcome: filters.outcome === outcome ? null : outcome,
  limit: ADMIN_PAGE_SIZE,
});

/** "Ver más" en "Por cuenta": ADMIN_PAGE_SIZE cuentas más, hasta ADMIN_MAX_ROWS. */
export const showMoreAccounts = (filters: BotFilters): BotFilters => ({
  ...filters,
  limit: Math.min(ADMIN_MAX_ROWS, filters.limit + ADMIN_PAGE_SIZE),
});

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
  "tope_mensual",
  "pausa",
  "error",
  "vinculacion_fallida",
  "sin_vincular",
  "no_texto",
  "suspendida",
  "pendiente",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_TEXTS: Readonly<Record<Locale, Record<Outcome, string>>> = {
  es: {
    registrado: "Registró movimientos",
    comando: "Comandos (balance, reporte, deshacer, ayuda)",
    respuesta: "Respuesta sin registrar nada",
    vinculado: "Vinculó su número",
    tope_claude: "Llegó al tope de Claude",
    tope_mensual: "Tope mensual de tokens alcanzado (se pidió usar la web)",
    pausa: "Claude en pausa (se pidió usar la web)",
    error: "Error",
    vinculacion_fallida: "Código de vinculación inválido",
    sin_vincular: "Número sin vincular",
    no_texto: "No era texto (audio, foto…)",
    suspendida: "Cuenta suspendida",
    pendiente: "Sin procesar todavía",
  },
  // Los comandos van como se escriben en el bot, que responde en español.
  en: {
    registrado: "Recorded transactions",
    comando: "Commands (balance, reporte, deshacer, ayuda)",
    respuesta: "Reply without recording anything",
    vinculado: "Linked their number",
    tope_claude: "Hit the Claude limit",
    tope_mensual: "Monthly token limit reached (asked to use the web)",
    pausa: "Claude paused (asked to use the web)",
    error: "Error",
    vinculacion_fallida: "Invalid linking code",
    sin_vincular: "Number not linked",
    no_texto: "Not text (audio, photo…)",
    suspendida: "Suspended account",
    pendiente: "Not processed yet",
  },
};

/** En español (el de siempre). */
export const OUTCOME_LABELS = OUTCOME_TEXTS.es;

/** Los resultados que piden atención (se resaltan en la página). */
export const PROBLEM_OUTCOMES: readonly Outcome[] = ["tope_claude", "tope_mensual", "error", "pendiente"];

/** Con "Todo", el gráfico de Claude por día muestra los últimos 30 días. */
export const CLAUDE_DAYS_WHEN_ALL = 30;

/** Los días del gráfico de llamadas a Claude (YYYY-MM-DD, del más viejo al más nuevo). */
export function claudeDays(filters: BotFilters, today: string): string[] {
  const range = dateRange(filters, today);
  // Stryker disable next-line EqualityOperator: si son el mismo día, da lo mismo cuál se toma
  const to = range.to && range.to < today ? range.to : today;
  const from = range.from ?? addDays(to, -(CLAUDE_DAYS_WHEN_ALL - 1));
  const days: string[] = [];
  // Tope por si un rango personalizado es enorme: el gráfico solo muestra los últimos 90 días.
  // Stryker disable next-line EqualityOperator: ídem
  for (let day = from > addDays(to, -89) ? from : addDays(to, -89); day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Segundos para leer: "0,8 s", "12 s", "2 min" (en inglés, "0.8 s"). */
export function formatSeconds(seconds: number, locale: Locale = DEFAULT_LOCALE): string {
  if (seconds < 10) return `${locale === "es" ? seconds.toFixed(1).replace(".", ",") : seconds.toFixed(1)} s`;
  if (seconds < 120) return `${Math.round(seconds)} s`;
  return `${Math.round(seconds / 60)} min`;
}

type ApiErrorBody = { error?: { message?: string; code?: number; error_data?: { details?: string } } };

/**
 * Lo que respondió una API al fallar, para leer: "400 {"error":{…}}" → "HTTP 400 · (#131030) El número…".
 * De la Graph API de Meta usa la explicación (error_data.details, en el idioma de la cuenta) y su
 * código; de la de Anthropic, el mensaje. Si no es ese formato (o quedó cortado), lo deja igual.
 */
export function readableApiError(detail: string): string {
  const match = detail.match(/^(\d{3}) (\{[\s\S]*\})$/);
  // Stryker disable next-line ConditionalExpression: sin match, match[2] lanza dentro del try y el catch devuelve detail igual
  if (!match) return detail;
  let body: ApiErrorBody;
  try {
    body = JSON.parse(match[2]) as ApiErrorBody;
  } catch {
    return detail;
  }
  const text = body.error?.error_data?.details ?? body.error?.message;
  if (!text) return detail;
  // Stryker disable next-line OptionalChaining: si hay texto (arriba), body.error existe
  const code = body.error?.code && !text.includes(`#${body.error.code}`) ? `(#${body.error.code}) ` : "";
  return `HTTP ${match[1]} · ${code}${text}`;
}

const ERROR_TEXTS = {
  es: {
    send: "No se pudo enviar la respuesta por WhatsApp",
    notConfigured: "Claude no está configurado (falta la API key)",
    refusal: "Claude no quiso responder",
    invalidOutput: "Claude respondió en un formato que no se pudo leer",
    apiError: "Error de la API de Claude",
    empty: "Error sin detalle",
    internal: "Error interno de la app",
  },
  en: {
    send: "The reply couldn't be sent over WhatsApp",
    notConfigured: "Claude isn't set up (the API key is missing)",
    refusal: "Claude declined to answer",
    invalidOutput: "Claude answered in a format that couldn't be read",
    apiError: "Claude API error",
    empty: "Error with no detail",
    internal: "Internal app error",
  },
} as const satisfies Record<Locale, unknown>;

/**
 * El nombre de un error del bot (la columna error: el motivo que dio Claude, el tipo de excepción o
 * lo que respondió WhatsApp al enviar). Lo técnico va aparte, como detalle, tal cual.
 */
export function errorLabel(error: string, locale: Locale = DEFAULT_LOCALE): { label: string; detail: string | null } {
  const t = ERROR_TEXTS[locale];
  const send = error.indexOf("envío: ");
  if (send >= 0) {
    const detail = error.slice(send + "envío: ".length);
    return { label: t.send, detail: detail ? readableApiError(detail) : null };
  }
  const [reason, ...rest] = error.split(": ");
  const raw = rest.join(": ");
  const detail = raw ? readableApiError(raw) : null;
  switch (reason) {
    case "not_configured":
      return { label: t.notConfigured, detail };
    case "refusal":
      return { label: t.refusal, detail };
    case "invalid_output":
      return { label: t.invalidOutput, detail };
    case "api_error":
      return { label: t.apiError, detail };
    case "":
      return { label: t.empty, detail: null };
    default:
      // Lo que lanzaba la SDK de Anthropic sin API key, antes de que el bot lo revisara (not_configured).
      if (error.startsWith("Could not resolve authentication method")) {
        return { label: t.notConfigured, detail: error };
      }
      return { label: t.internal, detail: error };
  }
}

/** Un número para leer, con los separadores de miles del idioma: "18.400" (en inglés, "18,400"; no es dinero). */
export const formatCount = (n: number, locale: Locale = DEFAULT_LOCALE) => new Intl.NumberFormat(INTL_LOCALES[locale]).format(n);

/** Un día (YYYY-MM-DD) corto, para el gráfico: "12 oct" (en inglés, "Oct 12"). */
export function formatShortDay(day: string, locale: Locale = DEFAULT_LOCALE): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (locale === "en") return new Intl.DateTimeFormat(INTL_LOCALES.en, { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  // Por partes: el formato completo de es-CO dice "12 de oct".
  const parts = new Intl.DateTimeFormat(INTL_LOCALES.es, { day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(date);
  const part = (type: "day" | "month") => parts.find((p) => p.type === type)!.value;
  return `${part("day")} ${part("month")}`;
}

/**
 * Reenviar respuestas que no salieron: WhatsApp solo deja escribirle a alguien hasta 24 horas después
 * de su último mensaje (la ventana de servicio de Meta), y se reenvían como mucho 50 por vez.
 */
export const RESEND_WINDOW_HOURS = 24;
export const MAX_RESENDS = 50;

/** Un día (YYYY-MM-DD) con el mes en letras: "1 de noviembre" (en inglés, "November 1"). */
export const formatDayMonth = (day: string, locale: Locale = DEFAULT_LOCALE) =>
  new Intl.DateTimeFormat(INTL_LOCALES[locale], { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** El último mensaje de una cuenta, corto: "hoy", "ayer" o "13 oct" (días de Colombia; en inglés, "today", "Oct 13"). */
export function lastSeenLabel(last: Date, today: string, locale: Locale = DEFAULT_LOCALE): string {
  const es = locale === "es";
  const day = todayInTimezone(ADMIN_TIMEZONE, last);
  if (day === today) return es ? "hoy" : "today";
  if (day === addDays(today, -1)) return es ? "ayer" : "yesterday";
  return formatShortDay(day, locale);
}
