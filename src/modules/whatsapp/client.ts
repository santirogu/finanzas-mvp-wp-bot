import "server-only";
import { envVar } from "@/lib/env";
import { describeError } from "@/lib/safe-log";
import { CHECK_TIMEOUT_MS, type ServiceCheck } from "@/lib/service-check";
import { serviceUrl } from "@/lib/service-url";

const GRAPH_VERSION = envVar("WHATSAPP_GRAPH_VERSION") || "v26.0";

export type SendResult = { ok: true } | { ok: false; error: string };
export type Sender = (to: string, body: string) => Promise<SendResult>;

export function isWhatsAppConfigured() {
  return Boolean(envVar("WHATSAPP_ACCESS_TOKEN") && envVar("WHATSAPP_PHONE_NUMBER_ID"));
}

/** Envía un mensaje de texto con la WhatsApp Cloud API. */
export const sendWhatsAppText: Sender = async (to, body) => {
  if (!isWhatsAppConfigured()) {
    // En desarrollo sin credenciales de Meta, solo se registra en consola.
    console.info(`[whatsapp:dev] → ${to}\n${body}`);
    return { ok: true };
  }

  // WHATSAPP_API_URL: solo para las pruebas E2E (un servidor falso en localhost).
  const base = serviceUrl("WHATSAPP_API_URL", "https://graph.facebook.com");
  const url = `${base}/${GRAPH_VERSION}/${envVar("WHATSAPP_PHONE_NUMBER_ID")}/messages`;
  // Sin respuesta (10 s) o sin red, fetch lanza: se devuelve como un envío fallido (solo el tipo del error), para
  // que el mensaje quede registrado como fallido y no "sin procesar" (src/modules/bot/handle-message.ts).
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${envVar("WHATSAPP_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((err: unknown) => describeError(err));
  if (typeof response === "string") return { ok: false, error: response };

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, error: `${response.status} ${detail.slice(0, 500)}` };
  }
  return { ok: true };
};

/**
 * Prueba el token de WhatsApp sin enviar nada: lee el nombre, el número y la calidad del número del
 * bot en la Graph API (gratis). Necesita el permiso whatsapp_business_management, el mismo de
 * scripts/meta-subscribe.sh.
 */
export async function checkWhatsAppConnection(): Promise<ServiceCheck> {
  const missing = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"].filter((name) => !envVar(name));
  if (missing.length > 0) return { status: "sin_configurar", missing };

  const base = serviceUrl("WHATSAPP_API_URL", "https://graph.facebook.com");
  const url = `${base}/${GRAPH_VERSION}/${envVar("WHATSAPP_PHONE_NUMBER_ID")}?fields=verified_name,display_phone_number,quality_rating`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${envVar("WHATSAPP_ACCESS_TOKEN")}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
  } catch (err) {
    return { status: "error", error: describeError(err) };
  }
  const body = await response.text().catch(() => "");
  if (!response.ok) return { status: "error", error: `${response.status} ${body.slice(0, 500)}` };

  let number: { verified_name?: string; display_phone_number?: string; quality_rating?: string } = {};
  try {
    number = JSON.parse(body);
  } catch {
    // Meta respondió 200 sin JSON: el token sirve, pero no hay datos que mostrar.
  }
  const detail = [number.verified_name, number.display_phone_number].filter(Boolean).join(" · ") || null;
  // GREEN es la calidad normal; YELLOW o RED avisan que Meta podría limitar el número.
  const quality = number.quality_rating?.toUpperCase();
  return quality && quality !== "GREEN" && quality !== "UNKNOWN"
    ? { status: "ok", detail, warning: { kind: "low_quality", quality } }
    : { status: "ok", detail };
}
