import { createHmac, randomInt, randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import { E2E_WHATSAPP_APP_SECRET, FAKE_SERVICES_URL } from "./fake-config";

// El WhatsApp de las E2E: mensajes firmados como los manda Meta al webhook, y lo que el bot
// respondió, guardado por el WhatsApp falso (e2e/fake-services.mjs).

export type Sent = { to: string; text: string };

/** Número de teléfono distinto en cada prueba (formato de WhatsApp, sin "+"). */
export const newPhone = () => `57300${randomInt(1_000_000, 10_000_000)}`;

/** Envía un mensaje al webhook como lo haría Meta (con la firma X-Hub-Signature-256). */
export async function sendWhatsApp(
  request: APIRequestContext,
  from: string,
  text: string | null,
  { id = `wamid.e2e.${randomUUID()}`, secret = E2E_WHATSAPP_APP_SECRET } = {},
) {
  const message =
    text === null
      ? { from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "audio", audio: { id: "a1" } }
      : { from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } };
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "e2e-waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              contacts: [{ wa_id: from, profile: { name: "Persona de prueba" } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  });
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  // Si la conexión se corta (ECONNRESET), se reintenta: es seguro, la app descarta un mensaje repetido
  // por su id, como hace con los reenvíos de Meta.
  return request.post("/api/whatsapp/webhook", {
    data: body,
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    maxRetries: 2,
  });
}

/** Lo que el bot le envió a un número (lo guarda el WhatsApp falso). */
export async function sentTo(request: APIRequestContext, phone: string): Promise<Sent[]> {
  const response = await request.get(`${FAKE_SERVICES_URL}/mensajes?to=${phone}`, { maxRetries: 2 });
  return response.json();
}

/** Espera la respuesta número `n` (1, 2, …) al número: el bot procesa después de responderle a Meta. */
export async function nthReply(request: APIRequestContext, phone: string, n: number) {
  await expect.poll(async () => (await sentTo(request, phone)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(n);
  return (await sentTo(request, phone))[n - 1].text;
}
