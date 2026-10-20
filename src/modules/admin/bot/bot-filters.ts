// Bot de WhatsApp (/admin/bot): los filtros que vienen en la URL, los resultados de cada mensaje y sus
// nombres. Sin base de datos (las consultas están en src/modules/admin/bot/bot-activity.ts).
//
// El módulo muestra cómo funciona el bot, nunca lo que la gente escribe: la política de privacidad
// promete que el admin no ve los mensajes (ni sus montos). Cada mensaje cuenta por su resultado.

import { todayInTimezone } from "@/lib/dates";
import type { ServiceCheck } from "@/lib/service-check";
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
export const ACCOUNT_SORT_LABELS: Record<AccountSort, string> = {
  tokens: "Tokens",
  mensajes: "Mensajes",
  errores: "Errores",
  ultimo: "Último mensaje",
};

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
export function activeBotFilters(filters: BotFilters): { label: string; href: string }[] {
  const base = { ...filters, limit: ADMIN_PAGE_SIZE };
  return [
    ...(filters.search ? [{ label: `“${filters.search}”`, href: botHref({ ...base, search: "" }) }] : []),
    ...(filters.outcome ? [{ label: `Resultado: ${OUTCOME_LABELS[filters.outcome]}`, href: botHref({ ...base, outcome: null }) }] : []),
    ...(filters.date !== "todo" ? [{ label: dateFilterLabel(filters), href: botHref({ ...base, date: "todo", from: null, to: null }) }] : []),
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

export const OUTCOME_LABELS: Record<Outcome, string> = {
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
};

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

/** Segundos para leer: "0,8 s", "12 s", "2 min". */
export function formatSeconds(seconds: number): string {
  if (seconds < 10) return `${seconds.toFixed(1).replace(".", ",")} s`;
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

/**
 * El nombre de un error del bot (la columna error: el motivo que dio Claude, el tipo de excepción o
 * lo que respondió WhatsApp al enviar). Lo técnico va aparte, como detalle.
 */
export function errorLabel(error: string): { label: string; detail: string | null } {
  const send = error.indexOf("envío: ");
  if (send >= 0) {
    const detail = error.slice(send + "envío: ".length);
    return { label: "No se pudo enviar la respuesta por WhatsApp", detail: detail ? readableApiError(detail) : null };
  }
  const [reason, ...rest] = error.split(": ");
  const raw = rest.join(": ");
  const detail = raw ? readableApiError(raw) : null;
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
      // Lo que lanzaba la SDK de Anthropic sin API key, antes de que el bot lo revisara (not_configured).
      if (error.startsWith("Could not resolve authentication method")) {
        return { label: "Claude no está configurado (falta la API key)", detail: error };
      }
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

/** Cómo se ve la prueba de un servicio en /admin/bot → Conexiones. */
export type ConnectionView = { ok: boolean; title: string; detail: string | null; warning: string | null };

const SERVICE_NAMES = { whatsapp: "el token de WhatsApp", claude: "la API key de Claude" } as const;
/** Por qué no sirve una credencial, con su género: "el token… vencido", "la API key… vencida". */
const INVALID_REASONS = { whatsapp: "vencido, revocado o mal copiado", claude: "vencida, revocada o mal copiada" } as const;

/**
 * El resultado de probar un servicio, para leer: qué pasó (title), lo técnico (detail) y un aviso.
 * Los errores más comunes llevan su causa: el token vencido o revocado de Meta, un permiso que falta,
 * un modelo que ya no existe, o que el servicio no respondió.
 */
export function connectionView(service: "whatsapp" | "claude", check: ServiceCheck): ConnectionView {
  if (check.status === "ok") return { ok: true, title: "Conectado", detail: check.detail, warning: check.warning ?? null };
  if (check.status === "sin_configurar") {
    return {
      ok: false,
      title: `Falta configurar ${check.missing.join(" y ")}`,
      detail: "Se configura en Vercel → Settings → Environment Variables (y en .env en local).",
      warning: null,
    };
  }
  const detail = readableApiError(check.error);
  const status = Number(check.error.match(/^(\d{3}) /)?.[1] ?? 0);
  const metaCode = check.error.match(/"code":\s*(\d+)/)?.[1];
  const fail = (title: string): ConnectionView => ({ ok: false, title, detail, warning: null });
  // "TimeoutError (23)": describeError suma el código heredado de DOMException.
  if (/^(TimeoutError|AbortError)\b/.test(check.error)) return { ok: false, title: "No respondió a tiempo (8 s)", detail: null, warning: null };
  if (/^(TypeError|APIConnectionError|Connection error)/.test(check.error)) return fail("No se pudo conectar con el servicio");
  if (service === "whatsapp" && (metaCode === "10" || metaCode === "200")) {
    return fail("El token no tiene permiso para leer el número (whatsapp_business_management); los envíos pueden funcionar igual");
  }
  if (status === 401 || metaCode === "190") return fail(`${capitalize(SERVICE_NAMES[service])} no sirve: ${INVALID_REASONS[service]}`);
  if (service === "claude" && status === 404) return fail("El modelo del bot no existe o la API key no tiene acceso a él (BOT_MODEL)");
  if (status === 403) return fail(`${capitalize(SERVICE_NAMES[service])} no tiene permiso`);
  return fail("El servicio respondió con un error");
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Reenviar respuestas que no salieron: WhatsApp solo deja escribirle a alguien hasta 24 horas después
 * de su último mensaje (la ventana de servicio de Meta), y se reenvían como mucho 50 por vez.
 */
export const RESEND_WINDOW_HOURS = 24;
export const MAX_RESENDS = 50;

/** Un día (YYYY-MM-DD) con el mes en letras: "1 de noviembre". */
export const formatDayMonth = (day: string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

/** El último mensaje de una cuenta, corto: "hoy", "ayer" o "13 oct" (días de Colombia). */
export function lastSeenLabel(last: Date, today: string): string {
  const day = todayInTimezone(ADMIN_TIMEZONE, last);
  if (day === today) return "hoy";
  if (day === addDays(today, -1)) return "ayer";
  return formatShortDay(day);
}
