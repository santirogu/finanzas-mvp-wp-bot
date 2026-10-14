import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { currentMonthRange, todayInTimezone } from "@/lib/dates";
import {
  createTransactionsFromMessage,
  undoLastWhatsAppEntry,
} from "@/modules/transactions/bot-mutations";
import { getMonthlySummary, listCategories } from "@/modules/transactions/queries";
import type { Sender } from "@/modules/whatsapp/client";
import { consumeLinkCode, getUserByPhone } from "@/modules/whatsapp/link";
import type { IncomingMessage } from "@/modules/whatsapp/payload";
import type { Extractor } from "./claude-extractor";
import { parseCommand } from "./commands";
import { interpretMessage, type BotIntent } from "./interpret";
import * as replies from "./replies";

type Deps = { extractor: Extractor; send: Sender; appUrl: string };

export type HandleResult =
  | { duplicate: true }
  | { duplicate: false; reply: string; intent: BotIntent | null; status: Status };

type Status = "processed" | "failed" | "link_failed";

/**
 * Procesa un mensaje entrante de WhatsApp de principio a fin:
 * deduplicar → identificar al usuario → interpretar → actuar → responder → registrar.
 */
export async function handleIncomingMessage(
  msg: IncomingMessage,
  deps: Deps,
): Promise<HandleResult> {
  const [fresh] = await db
    .insert(whatsappMessage)
    .values({ id: msg.id, phone: msg.from, body: msg.text ?? `[${msg.type}]` })
    .onConflictDoNothing()
    .returning({ id: whatsappMessage.id });
  if (!fresh) return { duplicate: true };

  let status: Status = "processed";
  let intent: BotIntent | null = null;
  let userId: string | null = null;
  let error: string | null = null;
  let reply: string;

  try {
    ({ reply, intent, userId, status } = await respond(msg, deps));
    if (intent?.kind === "error") error = intent.reason;
  } catch (err) {
    console.error("[bot] error procesando mensaje", msg.id, err);
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    reply = replies.errorReply;
  }

  const sent = await deps.send(msg.from, reply);
  if (!sent.ok) {
    status = "failed";
    error = [error, `envío: ${sent.error}`].filter(Boolean).join(" · ");
    console.error("[whatsapp] no se pudo enviar la respuesta", msg.id, sent.error);
  }
  console.info("[bot] mensaje procesado", {
    id: msg.id,
    estado: status,
    intencion: intent?.kind ?? null,
    vinculado: Boolean(userId),
    ...(error ? { error } : {}),
  });

  await db
    .update(whatsappMessage)
    .set({ status, userId, intent, reply, error, processedAt: new Date() })
    .where(eq(whatsappMessage.id, msg.id));

  return { duplicate: false, reply, intent, status };
}

async function respond(
  msg: IncomingMessage,
  deps: Deps,
): Promise<{ reply: string; intent: BotIntent | null; userId: string | null; status: Status }> {
  if (msg.text === null) {
    return { reply: replies.unsupportedTypeReply, intent: null, userId: null, status: "processed" };
  }

  // La vinculación funciona aunque el número aún no esté asociado a ninguna cuenta.
  const command = parseCommand(msg.text);
  if (command?.kind === "link") {
    const result = await consumeLinkCode(msg.from, command.code);
    if (!result.ok) {
      return {
        reply:
          result.reason === "rate_limited"
            ? replies.linkRateLimitedReply
            : replies.linkInvalidReply,
        intent: command,
        userId: null,
        status: "link_failed",
      };
    }
    return {
      reply: replies.linkedReply(result.name),
      intent: command,
      userId: result.userId,
      status: "processed",
    };
  }

  const user = await getUserByPhone(msg.from);
  if (!user) {
    return {
      reply: replies.notLinkedReply(deps.appUrl),
      intent: null,
      userId: null,
      status: "processed",
    };
  }

  const today = todayInTimezone(user.timezone);
  const range = currentMonthRange(user.timezone);
  const [expenseCategories, incomeCategories] = await Promise.all([
    listCategories(user.id, "expense"),
    listCategories(user.id, "income"),
  ]);
  const categories = { expense: expenseCategories, income: incomeCategories };

  const intent = await interpretMessage(
    msg.text,
    {
      today,
      categories: {
        expense: expenseCategories.map((c) => c.name),
        income: incomeCategories.map((c) => c.name),
      },
    },
    deps.extractor,
  );
  const base = { intent, userId: user.id, status: "processed" as Status };

  switch (intent.kind) {
    case "transactions": {
      await createTransactionsFromMessage({
        userId: user.id,
        currency: user.currency,
        messageId: msg.id,
        items: intent.items,
        categories,
      });
      const summary = await getMonthlySummary(user.id, range);
      return {
        ...base,
        reply: replies.registeredReply(intent.items, {
          today,
          currency: user.currency,
          balance: summary.balance,
          range,
        }),
      };
    }
    case "command": {
      if (intent.command === "balance") {
        const summary = await getMonthlySummary(user.id, range);
        return {
          ...base,
          reply: replies.balanceReply(summary, { currency: user.currency, range }),
        };
      }
      if (intent.command === "undo") {
        const removed = await undoLastWhatsAppEntry(user.id);
        return { ...base, reply: replies.undoReply(removed, user.currency) };
      }
      return { ...base, reply: replies.helpReply(user.name) };
    }
    case "reply":
      return { ...base, reply: intent.text };
    case "error":
      return { ...base, status: "failed", reply: replies.errorReply };
    case "link":
      // Ya se manejó arriba; se deja por exhaustividad.
      return { ...base, reply: replies.helpReply(user.name) };
  }
}
