import { formatLongDate } from "@/lib/dates";
import { parseCommand, type BotCommand } from "./commands";
import type { Extractor, Usage } from "./claude-extractor";
import { MAX_TRANSACTIONS_PER_MESSAGE } from "./limits";
import { normalizeReply, normalizeTransactions, type CategoryNames, type ParsedTransaction } from "./normalize";
import { tooManyTransactionsReply } from "./replies";

export type BotIntent =
  | BotCommand
  | { kind: "transactions"; items: ParsedTransaction[]; usage?: Usage }
  | { kind: "reply"; text: string; usage?: Usage }
  | { kind: "error"; reason: string; usage?: Usage };

const MAX_MESSAGE_LENGTH = 1000;

const FALLBACK_REPLY =
  "No logré identificar un ingreso o egreso en tu mensaje. Prueba algo como: “gasté $20.000 en almuerzo”.";

/**
 * Convierte un mensaje de WhatsApp en una intención del bot.
 * 1) Comandos fijos (balance, deshacer, ayuda, vincular) sin IA.
 * 2) Texto libre → extracción con Claude → validación.
 */
export async function interpretMessage(
  text: string,
  ctx: { today: string; categories: CategoryNames },
  extractor: Extractor,
): Promise<BotIntent> {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "command", command: "help" };

  const command = parseCommand(trimmed);
  if (command) return command;

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { kind: "reply", text: "Tu mensaje es muy largo. Envíame un movimiento a la vez, en pocas palabras." };
  }

  const result = await extractor({
    text: trimmed,
    today: { iso: ctx.today, long: formatLongDate(ctx.today) },
    categories: ctx.categories,
  });

  if (!result.ok) {
    return { kind: "error", reason: result.detail ? `${result.reason}: ${result.detail}` : result.reason, usage: result.usage };
  }

  // Más de los que caben en una respuesta (o un mensaje hecho para gastar): no se registra ninguno.
  if (result.transactions.length > MAX_TRANSACTIONS_PER_MESSAGE) {
    return { kind: "reply", text: tooManyTransactionsReply(MAX_TRANSACTIONS_PER_MESSAGE), usage: result.usage };
  }
  const items = normalizeTransactions(result.transactions, ctx);
  if (items.length > 0) return { kind: "transactions", items, usage: result.usage };

  // La IA propuso movimientos pero ninguno pasó la validación (p. ej. monto 0).
  if (result.transactions.length > 0) {
    return { kind: "reply", text: "No entendí el monto. ¿Cuánto fue exactamente?", usage: result.usage };
  }
  return { kind: "reply", text: normalizeReply(result.reply) ?? FALLBACK_REPLY, usage: result.usage };
}
