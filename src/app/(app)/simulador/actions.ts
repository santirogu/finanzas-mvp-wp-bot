"use server";

import { randomUUID } from "node:crypto";
import { getAppUrl } from "@/lib/app-url";
import { requireUser } from "@/lib/session";
import { claudeExtractor } from "@/modules/bot/claude-extractor";
import { handleIncomingMessage } from "@/modules/bot/handle-message";

export type SimulatedReply = {
  reply: string;
  status: string;
  intent: string | null;
};

// Simula un mensaje entrante de WhatsApp: mismo flujo que el webhook, pero la
// respuesta se devuelve a la página en vez de enviarse por WhatsApp.
export async function simulateMessageAction(phone: string, text: string): Promise<SimulatedReply> {
  if (process.env.NODE_ENV === "production")
    throw new Error("Simulador deshabilitado en producción");
  await requireUser();

  const result = await handleIncomingMessage(
    {
      id: `sim.${randomUUID()}`,
      from: phone.replace(/\D/g, ""),
      text,
      type: "text",
      timestamp: Math.floor(Date.now() / 1000),
      profileName: null,
    },
    {
      extractor: claudeExtractor,
      send: async () => ({ ok: true }),
      appUrl: getAppUrl(),
    },
  );

  if (result.duplicate) return { reply: "(duplicado)", status: "duplicate", intent: null };
  return {
    reply: result.reply,
    status: result.status,
    intent: result.intent ? JSON.stringify(result.intent, null, 2) : null,
  };
}
