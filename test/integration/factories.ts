import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transaction, user, whatsappMessage } from "@/db/schema";
import type { ExtractionResult, Extractor } from "@/modules/bot/claude-extractor";
import type { RawTransaction } from "@/modules/bot/normalize";
import type { SendResult } from "@/modules/whatsapp/client";
import type { IncomingMessage } from "@/modules/whatsapp/payload";

export async function createUser(overrides: Partial<typeof user.$inferInsert> = {}) {
  const id = randomUUID();
  const [row] = await db
    .insert(user)
    .values({ id, name: "Ana Pérez", email: `${id}@test.local`, ...overrides })
    .returning();
  return row;
}

let messageSeq = 0;
export function incoming(text: string | null, from = "573001112233", id?: string): IncomingMessage {
  return {
    id: id ?? `wamid.test.${Date.now()}.${messageSeq++}`,
    from,
    text,
    type: text === null ? "audio" : "text",
    timestamp: Math.floor(Date.now() / 1000),
    profileName: null,
  };
}

/** Extractor falso: devuelve lo indicado sin llamar a Claude. Usa la fecha "hoy" que recibe. */
export function fakeExtractor(
  result: Omit<RawTransaction, "date">[] | ((input: Parameters<Extractor>[0]) => ExtractionResult),
): Extractor & { calls: number } {
  const fn = async (input: Parameters<Extractor>[0]): Promise<ExtractionResult> => {
    fn.calls++;
    if (typeof result === "function") return result(input);
    return {
      ok: true,
      reply: result.length ? null : "¿Cuánto fue?",
      usage: { model: "fake", inputTokens: 0, outputTokens: 0 },
      transactions: result.map((t) => ({ ...t, date: input.today.iso })),
    };
  };
  fn.calls = 0;
  return fn;
}

/** Envío falso de WhatsApp que guarda lo enviado; puede simular fallas de Meta. */
export function capturingSender(options: { fail?: string } = {}) {
  const sent: { to: string; body: string }[] = [];
  const send = async (to: string, body: string): Promise<SendResult> => {
    sent.push({ to, body });
    return options.fail ? { ok: false, error: options.fail } : { ok: true };
  };
  return { send, sent };
}

export const activeTransactions = (userId: string) =>
  db
    .select()
    .from(transaction)
    .where(eq(transaction.userId, userId))
    .then((rows) => rows.filter((r) => r.deletedAt === null));

export const loggedMessage = (id: string) =>
  db
    .select()
    .from(whatsappMessage)
    .where(eq(whatsappMessage.id, id))
    .then((rows) => rows[0]);
