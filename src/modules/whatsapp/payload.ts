// Extrae los mensajes entrantes del payload del webhook de WhatsApp Cloud API.
// Formato: entry[].changes[].value.messages[]. Los "statuses" (entregado, leído) se ignoran.

export type IncomingMessage = {
  id: string;
  from: string;
  /** Texto del mensaje; null si es audio, imagen, sticker, etc. */
  text: string | null;
  type: string;
  timestamp: number;
  profileName: string | null;
};

type WebhookMessage = {
  id?: unknown;
  from?: unknown;
  type?: unknown;
  timestamp?: unknown;
  text?: { body?: unknown };
};

type WebhookValue = {
  messages?: WebhookMessage[];
  contacts?: { wa_id?: unknown; profile?: { name?: unknown } }[];
};

export function extractMessages(payload: unknown): IncomingMessage[] {
  // Stryker disable next-line ConditionalExpression: un texto o un número no tienen "object" ni "entry": la línea siguiente devuelve [] igual
  if (!payload || typeof payload !== "object") return [];
  const { object, entry } = payload as { object?: unknown; entry?: unknown };
  if (object !== "whatsapp_business_account" || !Array.isArray(entry)) return [];

  const result: IncomingMessage[] = [];
  for (const e of entry) {
    // Stryker disable next-line ArrayDeclaration: lo que no es un cambio de "messages" se salta (abajo), sea lo que sea
    for (const change of Array.isArray(e?.changes) ? e.changes : []) {
      if (change?.field !== "messages") continue;
      const value = (change.value ?? {}) as WebhookValue;
      // Stryker disable next-line ArrayDeclaration: lo que no trae id ni remitente se salta (abajo), sea lo que sea
      for (const m of Array.isArray(value.messages) ? value.messages : []) {
        if (typeof m.id !== "string" || typeof m.from !== "string") continue;
        const contact = value.contacts?.find((c) => c.wa_id === m.from);
        const type = typeof m.type === "string" ? m.type : "unknown";
        result.push({
          id: m.id,
          from: m.from,
          type,
          // Sin el carácter nulo: Postgres lo rechaza en un texto y el mensaje se perdería.
          text: type === "text" && typeof m.text?.body === "string" ? m.text.body.replaceAll("\u0000", "") : null,
          timestamp: Number(m.timestamp) || Math.floor(Date.now() / 1000),
          profileName: typeof contact?.profile?.name === "string" ? contact.profile.name : null,
        });
      }
    }
  }
  return result;
}
