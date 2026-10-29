import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { DEFAULT_LOCALE, localeOf, type Locale } from "@/i18n/locales";
import { envVar } from "@/lib/env";
import { compareMonths, currentMonthRange, monthRange, monthRangeUpTo, shiftMonth, todayInTimezone } from "@/lib/dates";
import { getBudgetCrossings } from "@/modules/budgets/budgets";
import { budgetAlert } from "@/modules/budgets/progress";
import { describeError } from "@/lib/safe-log";
import {
  createTransactionsFromMessage,
  undoLastWhatsAppEntry,
} from "@/modules/transactions/bot-mutations";
import { reportPeriod } from "@/modules/reports/period";
import { getReport } from "@/modules/reports/queries";
import { getMonthlySummary, listCategories } from "@/modules/transactions/queries";
import type { MediaDownloader, Sender } from "@/modules/whatsapp/client";
import { consumeLinkCode, getUserByPhone } from "@/modules/whatsapp/link";
import type { IncomingImage, IncomingMessage } from "@/modules/whatsapp/payload";
import { reserveAiCall } from "./ai-quota";
import type { Extractor } from "./claude-extractor";
import { balanceMonth, parseCommand, reportYear } from "./commands";
import { withHistoryDescriptions } from "./history";
import { interpretMessage, interpretPhoto, type BotIntent } from "./interpret";
import { monthlyBudgetReached } from "./limits";
import { photoMediaType, type PhotoImage } from "./photo";
import * as replies from "./replies";
import { resolveBotModel } from "./models";
import { getBotSettings } from "./settings";
import { tokensUsedThisMonth } from "./token-budget";

/** `download`: baja la foto de un mensaje desde Meta (src/modules/whatsapp/client.ts). */
type Deps = { extractor: Extractor; send: Sender; appUrl: string; download: MediaDownloader };

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
    .values({ id: msg.id, phone: msg.from, body: loggedBody(msg) })
    .onConflictDoNothing()
    .returning({ id: whatsappMessage.id });
  if (!fresh) return { duplicate: true };

  let status: Status = "processed";
  let intent: BotIntent | null = null;
  let userId: string | null = null;
  let error: string | null = null;
  let reply: string;
  // El idioma de la respuesta: el de la cuenta, en cuanto `respond` sabe cuál es (si falla después, el aviso del
  // error también va en ese idioma).
  const language = { locale: DEFAULT_LOCALE as Locale };

  try {
    ({ reply, intent, userId, status } = await respond(msg, deps, language));
    if (intent?.kind === "error") error = intent.reason;
  } catch (err) {
    // Solo el tipo y el código: el mensaje de un error de la base trae los datos del mensaje.
    console.error("[bot] error procesando mensaje", msg.id, describeError(err));
    status = "failed";
    error = describeError(err);
    reply = replies.errorReply(language.locale);
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

/** Lo que queda en el registro de mensajes: el texto o, si no, el tipo ("[image]", con lo que escribió con la foto). */
function loggedBody(msg: IncomingMessage): string {
  if (msg.text !== null) return msg.text;
  return msg.image?.caption ? `[${msg.type}] ${msg.image.caption}` : `[${msg.type}]`;
}

type Response = { reply: string; intent: BotIntent | null; userId: string | null; status: Status };

async function respond(msg: IncomingMessage, deps: Deps, language: { locale: Locale }): Promise<Response> {
  // Lo que se interpreta: un texto o una foto. Audios, stickers, videos o documentos, todavía no.
  const content =
    msg.text !== null ? ({ kind: "text", text: msg.text } as const) : msg.image ? ({ kind: "photo", photo: msg.image } as const) : null;

  // La vinculación funciona aunque el número aún no esté asociado a ninguna cuenta. Si el código no sirve, no se
  // sabe de qué cuenta es: la respuesta va en el idioma de la palabra que usó ("VINCULAR" o "LINK").
  const command = content?.kind === "text" ? parseCommand(content.text) : null;
  if (command?.kind === "link") {
    const result = await consumeLinkCode(msg.from, command.code);
    if (!result.ok) {
      return {
        reply:
          result.reason === "rate_limited"
            ? replies.linkRateLimitedReply(command.locale)
            : replies.linkInvalidReply(command.locale),
        intent: command,
        userId: null,
        status: "link_failed",
      };
    }
    return {
      reply: replies.linkedReply(result.name, localeOf(result.locale)),
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
  const locale = localeOf(user.locale);
  language.locale = locale;
  // Suspendida por el admin: no se interpreta (ni se gasta Claude) ni se registra nada.
  if (user.suspendedAt) {
    return { reply: replies.suspendedReply(locale), intent: null, userId: user.id, status: "processed" };
  }
  if (!content) {
    return { reply: replies.unsupportedTypeReply(locale), intent: null, userId: user.id, status: "processed" };
  }

  const today = todayInTimezone(user.timezone);
  const range = currentMonthRange(user.timezone);
  const [expenseCategories, incomeCategories] = await Promise.all([
    listCategories(user.id, "expense"),
    listCategories(user.id, "income"),
  ]);
  const categories = { expense: expenseCategories, income: incomeCategories };

  // Antes de cada llamada a Claude: que el admin no lo haya pausado, que no se haya usado el tope
  // mensual de tokens y que la cuenta tenga cupo (src/modules/bot/ai-quota.ts), con la configuración
  // de /admin/bot. Los comandos no llegan aquí.
  const extractor: Extractor = async (input) => {
    const settings = await getBotSettings();
    if (settings.claudePaused) return { ok: false, reason: "paused" };
    if (settings.monthlyTokenLimit !== null && monthlyBudgetReached(settings.monthlyTokenLimit, await tokensUsedThisMonth())) {
      return { ok: false, reason: "monthly_limit" };
    }
    if (!(await reserveAiCall(user.id, msg.id, settings.limits))) return { ok: false, reason: "rate_limited" };
    // El modelo que eligió el admin (o el de BOT_MODEL, o el de siempre): aplica desde el siguiente mensaje.
    return deps.extractor({ ...input, model: resolveBotModel(settings.model, envVar("BOT_MODEL")) });
  };
  const ctx = {
    today,
    categories: {
      expense: expenseCategories.map((c) => c.name),
      income: incomeCategories.map((c) => c.name),
    },
    locale,
  };
  let intent: BotIntent;
  if (content.kind === "text") {
    intent = await interpretMessage(content.text, ctx, extractor);
  } else {
    const photo = await readPhoto(content.photo, deps.download, locale);
    if (!photo.ok) return { ...photo.response, userId: user.id };
    intent = await interpretPhoto({ image: photo.image, caption: content.photo.caption }, ctx, extractor);
  }
  const base = { intent, userId: user.id, status: "processed" as Status };

  switch (intent.kind) {
    case "transactions": {
      // Con la descripción (y la categoría) que ya usó en su historial: "pago claro amor" queda como
      // "Claro Postpago Cata Amor". La respuesta muestra lo que quedó guardado.
      const items = await withHistoryDescriptions(user.id, intent.items, categories, today);
      const saved = await createTransactionsFromMessage({
        userId: user.id,
        currency: user.currency,
        messageId: msg.id,
        items,
        categories,
      });
      // Los presupuestos que cruzaron el 80 % o el límite con estos egresos (solo los de este mes).
      const [summary, crossings, label] = await Promise.all([
        getMonthlySummary(user.id, range),
        getBudgetCrossings(user.id, range, saved, locale),
        categoryLabels(user.id, categories, locale),
      ]);
      return {
        ...base,
        reply: replies.registeredReply(
          items.map((item) => ({ ...item, category: item.category && label(item.type, item.category) })),
          {
            today,
            currency: user.currency,
            balance: summary.balance,
            range,
            locale,
            budgetAlerts: crossings.map((crossing) => ({ level: crossing.level, text: budgetAlert(crossing, user.currency, locale) })),
          },
        ),
      };
    }
    case "command": {
      if (intent.command === "balance") {
        // El mes que pidió ("balance septiembre", "balance mes pasado") o, sin decir, este.
        const asked = balanceMonth(intent.period, range);
        if ("future" in asked) return { ...base, reply: replies.futureMonthReply(asked.future, locale) };
        if ("tooOld" in asked) return { ...base, reply: replies.tooOldMonthReply(locale) };
        const previous = shiftMonth(asked.month, -1);
        // Con este mes, el anterior hasta el mismo día (como en el Resumen).
        const upToToday = compareMonths(asked.month, range) === 0;
        const [summary, before] = await Promise.all([
          getMonthlySummary(user.id, monthRange(asked.month.year, asked.month.month)),
          getMonthlySummary(user.id, upToToday ? monthRangeUpTo(previous, today) : monthRange(previous.year, previous.month)),
        ]);
        return {
          ...base,
          reply: replies.balanceReply(summary, {
            currency: user.currency,
            range: asked.month,
            locale,
            previous: { month: previous, summary: before, upToToday },
          }),
        };
      }
      if (intent.command === "report") {
        // Los últimos 12 meses o el año que pidió ("reporte 2025"): lo mismo que /reportes en la web.
        const asked = reportYear(intent.period, range);
        if ("future" in asked) return { ...base, reply: replies.futureYearReply(asked.future, locale) };
        if ("tooOld" in asked) return { ...base, reply: replies.tooOldYearReply(locale) };
        const period = reportPeriod(asked.id, range, locale);
        const report = await getReport(user.id, period, range, locale);
        return { ...base, reply: replies.reportReply(report, period, { currency: user.currency, appUrl: deps.appUrl, locale }) };
      }
      if (intent.command === "undo") {
        const removed = await undoLastWhatsAppEntry(user.id);
        return { ...base, reply: replies.undoReply(removed, user.currency, locale) };
      }
      return { ...base, reply: replies.helpReply(locale, user.name) };
    }
    case "reply":
      return { ...base, reply: intent.text };
    case "error":
      if (intent.reason === "rate_limited") return { ...base, reply: replies.aiRateLimitedReply(locale) };
      if (intent.reason === "paused") return { ...base, reply: replies.aiPausedReply(deps.appUrl, locale) };
      if (intent.reason === "monthly_limit") return { ...base, reply: replies.aiMonthlyLimitReply(deps.appUrl, locale) };
      return {
        ...base,
        status: "failed",
        // Sin API key el texto libre no se puede interpretar: avisamos qué sí funciona.
        reply: intent.reason === "not_configured" ? replies.aiUnavailableReply(locale) : replies.errorReply(locale),
      };
    case "link":
      // Ya se manejó arriba; se deja por exhaustividad.
      return { ...base, reply: replies.helpReply(locale, user.name) };
  }
}

/**
 * Cómo se ve cada categoría en el idioma de la cuenta (`name_en`, si el admin se lo puso). El bot y lo que se
 * guarda usan siempre el nombre en español (`name`), así que solo cambia en la respuesta.
 */
async function categoryLabels(
  userId: string,
  categories: Record<"expense" | "income", readonly { id: string; name: string }[]>,
  locale: Locale,
): Promise<(type: "expense" | "income", name: string) => string> {
  if (locale === DEFAULT_LOCALE) return (_type, name) => name;
  const [expense, income] = await Promise.all([listCategories(userId, "expense", locale), listCategories(userId, "income", locale)]);
  const translated = new Map([...expense, ...income].map((c) => [c.id, c.name]));
  // Por tipo: un ingreso y un egreso pueden tener una categoría con el mismo nombre ("Otros").
  const byName = {
    expense: new Map(categories.expense.map((c) => [c.name, translated.get(c.id) ?? c.name])),
    income: new Map(categories.income.map((c) => [c.name, translated.get(c.id) ?? c.name])),
  };
  return (type, name) => byName[type].get(name) ?? name;
}

/**
 * Baja la foto de Meta y la deja lista para Claude. Antes de llamarlo (y de reservar su cupo): si Meta no la
 * entrega o no es una imagen que Claude entienda, no se gasta nada y se le dice a la persona cómo seguir.
 */
async function readPhoto(
  photo: IncomingImage,
  download: MediaDownloader,
  locale: Locale,
): Promise<{ ok: true; image: PhotoImage } | { ok: false; response: Omit<Response, "userId"> }> {
  const media = await download(photo.id);
  if (!media.ok) {
    return {
      ok: false,
      response: {
        reply: replies.photoDownloadFailedReply(locale),
        intent: { kind: "error", reason: `foto: ${media.error}` },
        status: "failed",
      },
    };
  }
  const mediaType = photoMediaType(media.data);
  if (!mediaType) return { ok: false, response: { reply: replies.photoFormatReply(locale), intent: null, status: "processed" } };
  return { ok: true, image: { data: media.data.toString("base64"), mediaType } };
}
