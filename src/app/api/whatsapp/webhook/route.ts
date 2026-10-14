import { after, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { claudeExtractor } from "@/modules/bot/claude-extractor";
import { handleIncomingMessage } from "@/modules/bot/handle-message";
import { sendWhatsAppText } from "@/modules/whatsapp/client";
import { extractMessages } from "@/modules/whatsapp/payload";
import { isValidSignature } from "@/modules/whatsapp/signature";
import { envVar } from "@/lib/env";

// Tiempo máximo para procesar los mensajes después de responder a Meta.
export const maxDuration = 60;

/** Verificación inicial del webhook desde el panel de Meta. */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const token = envVar("WHATSAPP_VERIFY_TOKEN");
  if (token && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === token) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Mensajes entrantes. Respondemos 200 de inmediato y procesamos después con after(). */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const appSecret = envVar("WHATSAPP_APP_SECRET") ?? "";
  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const messages = extractMessages(payload);
  if (messages.length > 0) {
    after(async () => {
      for (const message of messages) {
        try {
          await handleIncomingMessage(message, {
            extractor: claudeExtractor,
            send: sendWhatsAppText,
            appUrl: getAppUrl(),
          });
        } catch (error) {
          console.error("[whatsapp] no se pudo procesar", message.id, error);
        }
      }
    });
  }

  return new Response("OK", { status: 200 });
}
