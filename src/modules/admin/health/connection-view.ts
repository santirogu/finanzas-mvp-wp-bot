import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import type { ServiceCheck, ServiceWarning } from "@/lib/service-check";
import { readableApiError } from "@/modules/admin/bot/bot-filters";

// Cómo se lee el resultado de probar WhatsApp y Claude en /admin/salud (src/modules/admin/health/
// connections.ts): qué pasó, lo técnico y un aviso, en el idioma de la página. Sin el token ni la API key.

/** Cómo se ve la prueba de un servicio en /admin/salud → Conexiones. */
export type ConnectionView = { ok: boolean; title: string; detail: string | null; warning: string | null };

const CONNECTION_TEXTS = {
  es: {
    ok: "Conectado",
    missing: (names: string[]) => `Falta configurar ${names.join(" y ")}`,
    whereToConfigure: "Se configura en Vercel → Settings → Environment Variables (y en .env en local).",
    timeout: "No respondió a tiempo (8 s)",
    noConnection: "No se pudo conectar con el servicio",
    noReadPermission: "El token no tiene permiso para leer el número (whatsapp_business_management); los envíos pueden funcionar igual",
    // Con su género: "el token… vencido", "la API key… vencida".
    invalid: { whatsapp: "El token de WhatsApp no sirve: vencido, revocado o mal copiado", claude: "La API key de Claude no sirve: vencida, revocada o mal copiada" },
    noModel: "El modelo del bot no existe o la API key no tiene acceso a él (BOT_MODEL)",
    forbidden: { whatsapp: "El token de WhatsApp no tiene permiso", claude: "La API key de Claude no tiene permiso" },
    other: "El servicio respondió con un error",
    lowQuality: (quality: string) => `Meta marca la calidad del número como ${quality}: podría limitar los envíos.`,
    deprecated: (since: string) => `Anthropic marcó el modelo como obsoleto (${since}): conviene cambiarlo.`,
  },
  en: {
    ok: "Connected",
    missing: (names: string[]) => `${names.join(" and ")} ${names.length === 1 ? "isn't" : "aren't"} set up`,
    whereToConfigure: "It's set up in Vercel → Settings → Environment Variables (and in .env locally).",
    timeout: "It didn't answer in time (8 s)",
    noConnection: "Couldn't connect to the service",
    noReadPermission: "The token isn't allowed to read the number (whatsapp_business_management); sending may still work",
    invalid: { whatsapp: "The WhatsApp token doesn't work: expired, revoked or copied wrong", claude: "The Claude API key doesn't work: expired, revoked or copied wrong" },
    noModel: "The bot's model doesn't exist or the API key can't use it (BOT_MODEL)",
    forbidden: { whatsapp: "The WhatsApp token isn't allowed", claude: "The Claude API key isn't allowed" },
    other: "The service answered with an error",
    lowQuality: (quality: string) => `Meta rates the number's quality as ${quality}: it could limit sending.`,
    deprecated: (since: string) => `Anthropic marked the model as deprecated (${since}): it's worth changing it.`,
  },
} as const satisfies Record<Locale, unknown>;

/**
 * El resultado de probar un servicio, para leer: qué pasó (title), lo técnico (detail) y un aviso.
 * Los errores más comunes llevan su causa: el token vencido o revocado de Meta, un permiso que falta,
 * un modelo que ya no existe, o que el servicio no respondió.
 */
export function connectionView(service: "whatsapp" | "claude", check: ServiceCheck, locale: Locale = DEFAULT_LOCALE): ConnectionView {
  const t = CONNECTION_TEXTS[locale];
  const warning = (w: ServiceWarning) => (w.kind === "low_quality" ? t.lowQuality(w.quality) : t.deprecated(w.since));
  if (check.status === "ok") return { ok: true, title: t.ok, detail: check.detail, warning: check.warning ? warning(check.warning) : null };
  if (check.status === "sin_configurar") {
    return { ok: false, title: t.missing(check.missing), detail: t.whereToConfigure, warning: null };
  }
  const detail = readableApiError(check.error);
  const status = Number(check.error.match(/^(\d{3}) /)?.[1] ?? 0);
  const metaCode = check.error.match(/"code":\s*(\d+)/)?.[1];
  const fail = (title: string): ConnectionView => ({ ok: false, title, detail, warning: null });
  // "TimeoutError (23)": describeError suma el código heredado de DOMException.
  if (/^(TimeoutError|AbortError)\b/.test(check.error)) return { ok: false, title: t.timeout, detail: null, warning: null };
  if (/^(TypeError|APIConnectionError|Connection error)/.test(check.error)) return fail(t.noConnection);
  if (service === "whatsapp" && (metaCode === "10" || metaCode === "200")) return fail(t.noReadPermission);
  if (status === 401 || metaCode === "190") return fail(t.invalid[service]);
  if (service === "claude" && status === 404) return fail(t.noModel);
  if (status === 403) return fail(t.forbidden[service]);
  return fail(t.other);
}
