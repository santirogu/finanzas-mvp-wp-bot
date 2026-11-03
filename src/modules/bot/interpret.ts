import type { Locale } from "@/i18n/locales";
import { formatLongDate } from "@/lib/dates";
import { parseCommand, type BotCommand } from "./commands";
import type { ExtractionResult, Extractor, Usage } from "./claude-extractor";
import { MAX_TRANSACTIONS_PER_MESSAGE } from "./limits";
import { normalizeReply, normalizeTransactions, type CategoryNames, type ParsedTransaction } from "./normalize";
import { PHOTO_MAX_DAYS_BACK, type PhotoImage } from "./photo";
import {
  amountUnclearReply,
  notUnderstoodReply,
  photoFallbackReply,
  photoManyReply,
  photoUnreadableReply,
  tooLongReply,
  tooManyTransactionsReply,
} from "./replies";

export type BotIntent =
  | BotCommand
  | { kind: "transactions"; items: ParsedTransaction[]; usage?: Usage }
  | { kind: "reply"; text: string; usage?: Usage }
  | { kind: "error"; reason: string; usage?: Usage };

const MAX_MESSAGE_LENGTH = 1000;

/** Lo que necesita para interpretar: el día de hoy, las categorías (en español) y el idioma de la cuenta (el de las respuestas). */
type Context = { today: string; categories: CategoryNames; locale: Locale };

/**
 * Convierte un mensaje de WhatsApp en una intención del bot.
 * 1) Comandos fijos (balance, reporte, deshacer, ayuda, vincular) sin IA.
 * 2) Texto libre → extracción con Claude → validación.
 */
export async function interpretMessage(text: string, ctx: Context, extractor: Extractor): Promise<BotIntent> {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "command", command: "help" };

  const command = parseCommand(trimmed);
  if (command) return command;

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    // Un mensaje puede traer varios movimientos (hasta MAX_TRANSACTIONS_PER_MESSAGE): lo que sobra es el largo.
    return { kind: "reply", text: tooLongReply(ctx.locale) };
  }

  const result = await extractor({
    text: trimmed,
    today: { iso: ctx.today, long: formatLongDate(ctx.today) },
    categories: ctx.categories,
    locale: ctx.locale,
  });

  if (!result.ok) return errorIntent(result);

  // Más de los que caben en una respuesta (o un mensaje hecho para gastar): no se registra ninguno.
  if (result.transactions.length > MAX_TRANSACTIONS_PER_MESSAGE) {
    return { kind: "reply", text: tooManyTransactionsReply(MAX_TRANSACTIONS_PER_MESSAGE, ctx.locale), usage: result.usage };
  }
  const items = normalizeTransactions(result.transactions, ctx);
  if (items.length > 0) return { kind: "transactions", items, usage: result.usage };

  // La IA propuso movimientos pero ninguno pasó la validación (p. ej. monto 0).
  if (result.transactions.length > 0) return { kind: "reply", text: amountUnclearReply(ctx.locale), usage: result.usage };
  return { kind: "reply", text: normalizeReply(result.reply) ?? notUnderstoodReply(ctx.locale), usage: result.usage };
}

const errorIntent = (result: Extract<ExtractionResult, { ok: false }>): BotIntent => ({
  kind: "error",
  reason: result.detail ? `${result.reason}: ${result.detail}` : result.reason,
  usage: result.usage,
});

/**
 * Convierte la foto de una factura (con lo que escribió junto a ella) en una intención del bot: un solo egreso
 * con el total, con la fecha impresa si es de los últimos PHOTO_MAX_DAYS_BACK días (si no, la de hoy). Sin
 * comandos: el texto de una foto es una pista para Claude, no una orden.
 */
export async function interpretPhoto(
  photo: { image: PhotoImage; caption: string | null },
  ctx: Context,
  extractor: Extractor,
): Promise<BotIntent> {
  const caption = photo.caption?.trim() ?? "";
  if (caption.length > MAX_MESSAGE_LENGTH) return { kind: "reply", text: tooLongReply(ctx.locale) };

  const result = await extractor({
    text: caption,
    image: photo.image,
    today: { iso: ctx.today, long: formatLongDate(ctx.today) },
    categories: ctx.categories,
    locale: ctx.locale,
  });
  if (!result.ok) return errorIntent(result);

  // Una factura es un movimiento: si la IA propone varios (los productos uno por uno, o varias facturas), no se
  // adivina cuál es el total.
  if (result.transactions.length > 1) return { kind: "reply", text: photoManyReply(ctx.locale), usage: result.usage };
  const items = normalizeTransactions(result.transactions, { ...ctx, maxDaysBack: PHOTO_MAX_DAYS_BACK });
  if (items.length > 0) return { kind: "transactions", items, usage: result.usage };
  // Propuso el movimiento pero no pasó la validación (el total en 0 o ilegible).
  if (result.transactions.length > 0) return { kind: "reply", text: photoUnreadableReply(ctx.locale), usage: result.usage };
  return { kind: "reply", text: normalizeReply(result.reply) ?? photoFallbackReply(ctx.locale), usage: result.usage };
}
