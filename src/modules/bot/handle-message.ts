import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { envVar } from "@/lib/env";
import { currentMonthRange, monthRange, shiftMonth, todayInTimezone } from "@/lib/dates";
import { describeError } from "@/lib/safe-log";
import {
  createTransactionsFromMessage,
  undoLastWhatsAppEntry,
} from "@/modules/transactions/bot-mutations";
import { reportPeriod } from "@/modules/reports/period";
import { getReport } from "@/modules/reports/queries";
import { getMonthlySummary, listCategories } from "@/modules/transactions/queries";
import type { Sender } from "@/modules/whatsapp/client";
import { consumeLinkCode, getUserByPhone } from "@/modules/whatsapp/link";
import type { IncomingMessage } from "@/modules/whatsapp/payload";
import { reserveAiCall } from "./ai-quota";
import type { Extractor } from "./claude-extractor";
import { balanceMonth, parseCommand, reportYear } from "./commands";
import { withHistoryDescriptions } from "./history";
import { interpretMessage, type BotIntent } from "./interpret";
import { monthlyBudgetReached } from "./limits";
import * as replies from "./replies";
import { resolveBotModel } from "./models";
import { getBotSettings } from "./settings";
import { tokensUsedThisMonth } from "./token-budget";

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
    // Solo el tipo y el código: el mensaje de un error de la base trae los datos del mensaje.
    console.error("[bot] error procesando mensaje", msg.id, describeError(err));
    status = "failed";
    error = describeError(err);
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
  // Suspendida por el admin: no se interpreta (ni se gasta Claude) ni se registra nada.
  if (user.suspendedAt) {
    return { reply: replies.suspendedReply, intent: null, userId: user.id, status: "processed" };
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
  const intent = await interpretMessage(
    msg.text,
    {
      today,
      categories: {
        expense: expenseCategories.map((c) => c.name),
        income: incomeCategories.map((c) => c.name),
      },
    },
    extractor,
  );
  const base = { intent, userId: user.id, status: "processed" as Status };

  switch (intent.kind) {
    case "transactions": {
      // Con la descripción (y la categoría) que ya usó en su historial: "pago claro amor" queda como
      // "Claro Postpago Cata Amor". La respuesta muestra lo que quedó guardado.
      const items = await withHistoryDescriptions(user.id, intent.items, categories, today);
      await createTransactionsFromMessage({
        userId: user.id,
        currency: user.currency,
        messageId: msg.id,
        items,
        categories,
      });
      const summary = await getMonthlySummary(user.id, range);
      return {
        ...base,
        reply: replies.registeredReply(items, {
          today,
          currency: user.currency,
          balance: summary.balance,
          range,
        }),
      };
    }
    case "command": {
      if (intent.command === "balance") {
        // El mes que pidió ("balance septiembre", "balance mes pasado") o, sin decir, este.
        const asked = balanceMonth(intent.period, range);
        if ("future" in asked) return { ...base, reply: replies.futureMonthReply(asked.future) };
        if ("tooOld" in asked) return { ...base, reply: replies.tooOldMonthReply };
        const previous = shiftMonth(asked.month, -1);
        const [summary, before] = await Promise.all([
          getMonthlySummary(user.id, monthRange(asked.month.year, asked.month.month)),
          getMonthlySummary(user.id, monthRange(previous.year, previous.month)),
        ]);
        return {
          ...base,
          reply: replies.balanceReply(summary, {
            currency: user.currency,
            range: asked.month,
            previous: { month: previous, summary: before },
          }),
        };
      }
      if (intent.command === "report") {
        // Los últimos 12 meses o el año que pidió ("reporte 2025"): lo mismo que /reportes en la web.
        const asked = reportYear(intent.period, range);
        if ("future" in asked) return { ...base, reply: replies.futureYearReply(asked.future) };
        if ("tooOld" in asked) return { ...base, reply: replies.tooOldYearReply };
        const period = reportPeriod(asked.id, range);
        const report = await getReport(user.id, period, range);
        return { ...base, reply: replies.reportReply(report, period, { currency: user.currency, appUrl: deps.appUrl }) };
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
      if (intent.reason === "rate_limited") return { ...base, reply: replies.aiRateLimitedReply };
      if (intent.reason === "paused") return { ...base, reply: replies.aiPausedReply(deps.appUrl) };
      if (intent.reason === "monthly_limit") return { ...base, reply: replies.aiMonthlyLimitReply(deps.appUrl) };
      return {
        ...base,
        status: "failed",
        // Sin API key el texto libre no se puede interpretar: avisamos qué sí funciona.
        reply: intent.reason === "not_configured" ? replies.aiUnavailableReply : replies.errorReply,
      };
    case "link":
      // Ya se manejó arriba; se deja por exhaustividad.
      return { ...base, reply: replies.helpReply(user.name) };
  }
}
