import "server-only";
import { envVar } from "@/lib/env";

const GRAPH_VERSION = envVar("WHATSAPP_GRAPH_VERSION") || "v23.0";

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

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${envVar("WHATSAPP_PHONE_NUMBER_ID")}/messages`;
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
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { ok: false, error: `${response.status} ${detail.slice(0, 500)}` };
  }
  return { ok: true };
};
