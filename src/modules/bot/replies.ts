// Textos que el bot envía por WhatsApp, en el idioma de la cuenta (`user.locale`). WhatsApp usa *negrita* y _cursiva_.
// Las respuestas que escribe Claude (cuando no entiende un mensaje) no están aquí: salen de su prompt.
import type { Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { CONTACT_EMAIL } from "@/lib/contact";
import { formatMonthLabel, formatMonthName, formatShortDate, type Month, type MonthRange } from "@/lib/dates";
import { BRAND_NAME } from "@/lib/brand";
import { formatMoney, formatPercent, formatShare } from "@/lib/money";
import type { CategoryReport } from "@/modules/reports/categories";
import { periodHref, type ReportPeriod } from "@/modules/reports/period";
import type { RecurringReport } from "@/modules/reports/recurring";
import type { PeriodSummary } from "@/modules/reports/summary";
import { balanceChange, previousMonthReference } from "@/modules/transactions/month-comparison";
import { BOT_COMMANDS, BOT_EXAMPLES, LINK_WORD } from "./help";
import type { ParsedTransaction } from "./normalize";

const TEXTS = texts(
  {
    // "Egreso Anotado": con la marca (y su mayúscula, por decisión del dueño) y el tipo, que es como se nota si
    // Claude tomó un ingreso por un egreso.
    registered: (type: ParsedTransaction["type"]) => `${type === "income" ? "Ingreso" : "Egreso"} ${BRAND_NAME}`,
    monthBalance: (month: string) => `Balance de ${month}`,
    undoHint: "_Escribe *deshacer* si me equivoqué._",
    income: "Ingresos",
    expenses: "Egresos",
    tryWriting: "Escríbeme algo como “gasté 20 mil en almuerzo”",
    noMonthTransactions: (month: string) => `Aún no tienes movimientos en ${month}`,
    tooOldMonth: "Solo puedo darte balances desde enero de 2000. Prueba con *balance* (este mes) o *balance mes pasado*.",
    futureMonth: (month: string) => `${month} todavía no llega 🙂. Prueba con *balance* (este mes) o *balance mes pasado*.`,
    // "De noviembre de 2025 a octubre de 2026" o, si es un solo mes, "Enero de 2026": dentro de una frase.
    noReportTransactions: (range: string, single: boolean) => `No tienes movimientos ${single ? `en ${range}` : range}`,
    reportSeeHere: "y aquí verás cómo te va",
    reportTitle: (range: string, single: boolean) => `Reporte ${single ? `de ${range}` : range}`,
    overspent: "gastaste más de lo que ganaste",
    saved: (percent: string) => `ahorraste el ${percent}`,
    average: "Gasto promedio por mes",
    topMonth: "Mes de más gasto",
    whereItWent: "En qué se te fue",
    bills: (amount: string) => `Gastos fijos: ${amount} al mes`,
    moreDetail: "Más detalle en *Reportes*",
    futureYear: (year: number) => `${year} todavía no llega 🙂. Prueba con *reporte* (los últimos 12 meses) o *reporte* y un año que ya pasó.`,
    tooOldYear: "Solo puedo darte reportes desde el 2000. Prueba con *reporte* (los últimos 12 meses) o *reporte 2025*.",
    nothingToUndo: "No encontré movimientos registrados por WhatsApp para deshacer.",
    undone: "Listo, eliminé:",
    hi: (name: string) => `Hola${name} 👋`,
    writeLikeThis: "Escríbeme tus ingresos y gastos como se los contarías a alguien:",
    photo: "📸 O envíame la foto de una factura y registro el total.",
    alsoUnderstand: "También entiendo:",
    or: "o",
    notLinked: (appUrl: string) => [
      `Este número aún no está vinculado a una cuenta. Entra a ${appUrl}/cuenta (*Mi cuenta*), toca *Conectar WhatsApp* y envíame el mensaje que te aparece: *${LINK_WORD.es}* y el código.`,
      "",
      `Si no tienes cuenta, créala en ${appUrl}/registro.`,
    ],
    linked: (name: string) => `✅ ¡Listo${name}! Tu WhatsApp quedó vinculado.\n\nPrueba escribiéndome: _gasté 20 mil en almuerzo_`,
    // Cuenta suspendida por el admin: no se registra nada, tampoco responde los comandos, y no se dice el motivo.
    suspended: `Tu cuenta está suspendida, así que no puedo registrar movimientos ni responder tus consultas. Si crees que es un error, escríbenos a ${CONTACT_EMAIL}.`,
    linkInvalid: "Ese código no es válido o ya venció. Pide otro en *Mi cuenta*: toca *Conectar WhatsApp*.",
    linkRateLimited: "Recibí demasiados códigos equivocados desde este número. Espera una hora y vuelve a intentarlo.",
    unsupportedType: "Por ahora solo entiendo mensajes de texto ✍️ y fotos de facturas 🧾",
    // Las fotos de facturas (src/modules/bot/interpret.ts → interpretPhoto): cuando no quedó registrada, cómo seguir.
    writeIt: "escríbeme el gasto, por ejemplo “almuerzo 25 mil”",
    photoFallback: (writeIt: string) => `No encontré una factura en la foto. Envíame una foto más clara del recibo o ${writeIt}.`,
    photoUnreadable: (writeIt: string) => `No logré leer el total de la factura. Envíame una foto más clara o ${writeIt}.`,
    photoMany: (writeIt: string) => `No registré nada: necesito una sola factura por foto. Envíamelas una por una o ${writeIt}.`,
    photoFormat: (writeIt: string) => `No pude abrir esa imagen. Envíame la factura como foto o ${writeIt}.`,
    // No se descargó (Meta no respondió): puede ser pasajero.
    photoDownloadFailed: (writeIt: string) => `No pude descargar tu foto 😕. Envíamela de nuevo en un momento o ${writeIt}.`,
    // El error puede llegar después de guardar (handle-message.ts): que revise antes de enviarlo de nuevo, para no
    // registrarlo dos veces.
    error: "Tuve un problema con tu mensaje 😕. Revisa en la web si quedó y, si no, envíamelo de nuevo en un momento.",
    // Los mensajes de texto libre que no se mandan a Claude o de los que no salió nada (src/modules/bot/interpret.ts).
    tooLong: "Tu mensaje es muy largo. Envíamelo en partes más cortas.",
    notUnderstood: "No logré identificar un ingreso o un egreso en tu mensaje. Prueba con algo como “gasté 20 mil en almuerzo”.",
    // Sin preguntar "¿cuánto fue?": el bot no recuerda el mensaje anterior, así que la respuesta llegaría sola.
    amountUnclear: "No entendí el monto. Escríbeme el movimiento completo con su monto, por ejemplo “almuerzo 25 mil”.",
    // Cuando el texto libre no se registra (tope, pausa, sin Claude): lo primero que dice es que no quedó, para que
    // la persona no crea que lo anotó.
    stillWorking: "Siguen funcionando *balance*, *reporte*, *deshacer* y *ayuda*.",
    registerOnWeb: (appUrl: string) => `Regístralo en la web, en *Egresos* o *Ingresos*: ${appUrl}/egresos.`,
    aiRateLimited:
      "No registré este mensaje: recibí muchos en poco tiempo. Espera un rato y envíamelo de nuevo. Mientras tanto, puedes escribir *balance*, *reporte*, *deshacer* o *ayuda*, o registrarlo en la web.",
    tooManyTransactions: (max: number) =>
      `No registré ninguno: tu mensaje trae más de ${max} movimientos. Envíamelos en varios mensajes, hasta ${max} en cada uno.`,
    aiPaused: "No registré tu mensaje: por ahora no puedo entender mensajes escritos libremente ni fotos 🛠️.",
    aiMonthlyLimit: "No registré tu mensaje: este mes ya usé todo mi cupo para entender mensajes escritos libremente y fotos 🛠️.",
    aiUnavailable:
      "No registré tu mensaje: por ahora solo entiendo *balance*, *reporte*, *deshacer* y *ayuda*. Muy pronto podrás registrar tus movimientos escribiendo como hablas ✍️.",
  },
  {
    en: {
      // "Anotado" es "anotado" en español: en inglés, "noted", como en el eslogan ("It's noted.").
      registered: (type) => `${type === "income" ? "Income" : "Expense"} noted`,
      monthBalance: (month) => `${month} balance`,
      undoHint: "_Send *undo* if I got it wrong._",
      income: "Income",
      expenses: "Expenses",
      tryWriting: "Send me something like “spent 20k on lunch”",
      noMonthTransactions: (month) => `You don't have any transactions in ${month} yet`,
      tooOldMonth: "I can only give you balances from January 2000. Try *balance* (this month) or *balance last month*.",
      futureMonth: (month) => `${month} isn't here yet 🙂. Try *balance* (this month) or *balance last month*.`,
      // "November 2025 to October 2026" o, si es un solo mes, "January 2026".
      noReportTransactions: (range, single) => `You don't have any transactions ${single ? "in" : "from"} ${range}`,
      reportSeeHere: "and you'll see how you're doing here",
      reportTitle: (range, single) => `Report ${single ? "for" : "from"} ${range}`,
      overspent: "you spent more than you earned",
      saved: (percent) => `you saved ${percent}`,
      average: "Average spending per month",
      topMonth: "Month with the most spending",
      whereItWent: "Where your money went",
      bills: (amount) => `Bills: ${amount} a month`,
      moreDetail: "More details in *Reports*",
      futureYear: (year) => `${year} isn't here yet 🙂. Try *report* (the last 12 months) or *report* and a year that already passed.`,
      tooOldYear: "I can only give you reports from 2000 on. Try *report* (the last 12 months) or *report 2025*.",
      nothingToUndo: "I didn't find any transactions added on WhatsApp to undo.",
      undone: "Done, I deleted:",
      hi: (name) => `Hi${name} 👋`,
      writeLikeThis: "Send me your income and expenses the way you'd tell someone:",
      photo: "📸 Or send me a photo of a receipt and I'll add the total.",
      alsoUnderstand: "I also understand:",
      or: "or",
      notLinked: (appUrl) => [
        `This number isn't linked to an account yet. Go to ${appUrl}/cuenta (*My account*), tap *Connect WhatsApp* and send me the message you see: *${LINK_WORD.en}* and the code.`,
        "",
        `If you don't have an account, create one at ${appUrl}/registro.`,
      ],
      linked: (name) => `✅ All set${name}! Your WhatsApp is linked.\n\nTry sending me: _spent 20k on lunch_`,
      suspended: `Your account is suspended, so I can't add transactions or answer your questions. If you think it's a mistake, write to us at ${CONTACT_EMAIL}.`,
      linkInvalid: "That code isn't valid or has expired. Get another one in *My account*: tap *Connect WhatsApp*.",
      linkRateLimited: "I got too many wrong codes from this number. Wait an hour and try again.",
      unsupportedType: "For now I only understand text messages ✍️ and photos of receipts 🧾",
      writeIt: "type the expense, for example “lunch 25k”",
      photoFallback: (writeIt) => `I didn't find a receipt in the photo. Send me a clearer photo of the receipt or ${writeIt}.`,
      photoUnreadable: (writeIt) => `I couldn't read the receipt's total. Send me a clearer photo or ${writeIt}.`,
      photoMany: (writeIt) => `I didn't add anything: I need one receipt per photo. Send them to me one by one or ${writeIt}.`,
      photoFormat: (writeIt) => `I couldn't open that image. Send me the receipt as a photo or ${writeIt}.`,
      photoDownloadFailed: (writeIt) => `I couldn't download your photo 😕. Send it to me again in a moment or ${writeIt}.`,
      error: "I had a problem with your message 😕. Check on the web whether it was added and, if not, send it to me again in a moment.",
      tooLong: "Your message is too long. Send it to me in shorter parts.",
      notUnderstood: "I couldn't find any income or expense in your message. Try something like “spent 20k on lunch”.",
      amountUnclear: "I didn't understand the amount. Send me the whole transaction with its amount, for example “lunch 25k”.",
      stillWorking: "*balance*, *report*, *undo* and *help* still work.",
      registerOnWeb: (appUrl) => `Add it on the web, in *Expenses* or *Income*: ${appUrl}/egresos.`,
      aiRateLimited:
        "I didn't add this message: I got a lot of them in a short time. Wait a while and send it to me again. Meanwhile, you can send *balance*, *report*, *undo* or *help*, or add it on the web.",
      tooManyTransactions: (max) =>
        `I didn't add any of them: your message has more than ${max} transactions. Send them to me in several messages, up to ${max} in each one.`,
      aiPaused: "I didn't add your message: for now I can't understand freely written messages or photos 🛠️.",
      aiMonthlyLimit: "I didn't add your message: this month I already used up my quota for understanding freely written messages and photos 🛠️.",
      aiUnavailable:
        "I didn't add your message: for now I only understand *balance*, *report*, *undo* and *help*. Soon you'll be able to add your transactions by writing the way you talk ✍️.",
    },
  },
);

// El emoji de cada aviso de presupuesto: llegar al 80 % o pasarse.
const BUDGET_ALERT_EMOJI = { near: "⚠️", over: "🚨" } as const;

/** ", Ana": el primer nombre, para el saludo; nada si no hay. */
const firstName = (name?: string) => (name ? `, ${name.split(" ")[0]}` : "");

/**
 * Lo que se registró (con el nombre de la categoría en el idioma de la cuenta), los avisos de los presupuestos que
 * cruzaron un umbral con eso (`budgetAlerts`, ya armados con budgetAlert) y el balance del mes.
 */
export function registeredReply(
  items: ParsedTransaction[],
  ctx: {
    today: string;
    currency: string;
    balance: number;
    range: MonthRange;
    locale: Locale;
    budgetAlerts?: { level: keyof typeof BUDGET_ALERT_EMOJI; text: string }[];
  },
): string {
  const t = TEXTS[ctx.locale];
  const money = (n: number) => formatMoney(n, ctx.currency, ctx.locale);
  const lines = items.map((item) => {
    const extras = [item.category, item.occurredOn !== ctx.today ? formatShortDate(item.occurredOn, { locale: ctx.locale }) : null]
      .filter(Boolean)
      .join(" · ");
    return `✅ ${t.registered(item.type)}: *${item.description}* — ${money(item.amount)}${extras ? ` (${extras})` : ""}`;
  });
  const alerts = (ctx.budgetAlerts ?? []).map((alert) => `${BUDGET_ALERT_EMOJI[alert.level]} ${alert.text}`);
  return [
    ...lines,
    ...(alerts.length > 0 ? ["", ...alerts] : []),
    "",
    `${t.monthBalance(formatMonthName(ctx.range, { locale: ctx.locale }))}: *${money(ctx.balance)}*`,
    t.undoHint,
  ].join("\n");
}

type Summary = { income: number; expense: number; balance: number; count: number };

// La flecha de la comparación con el mes anterior (como en la tarjeta del Resumen).
const CHANGE_ARROWS = { up: "↗ ", down: "↘ ", same: "" } as const;

/**
 * Los totales de un mes ("balance", "balance septiembre"). Con `previous` (el mes anterior), una línea
 * más con cómo cambió el balance, solo si ese mes tuvo movimientos. Con el mes en curso, `previous.summary`
 * es el anterior hasta el mismo día (`upToToday`): "más que a esta altura de septiembre".
 */
export function balanceReply(
  summary: Summary,
  ctx: { currency: string; range: Month; locale: Locale; previous?: { month: Month; summary: Summary; upToToday: boolean } },
): string {
  const { locale } = ctx;
  const t = TEXTS[locale];
  const money = (n: number) => formatMoney(n, ctx.currency, locale);
  if (summary.count === 0) {
    return `${t.noMonthTransactions(formatMonthName(ctx.range, { withYear: true, locale }))}. ${t.tryWriting}.`;
  }
  const previous = ctx.previous && ctx.previous.summary.count > 0 ? ctx.previous : null;
  const change = previous
    ? balanceChange(
        summary.balance,
        previous.summary.balance,
        previousMonthReference(formatMonthName(previous.month, { locale }), previous.upToToday, locale),
        ctx.currency,
        locale,
      )
    : null;
  return [
    `📊 *${formatMonthLabel(ctx.range, locale)}*`,
    `${t.income}: ${money(summary.income)}`,
    `${t.expenses}: ${money(summary.expense)}`,
    `Balance: *${money(summary.balance)}*`,
    ...(change ? [`_${CHANGE_ARROWS[change.direction]}${change.text}_`] : []),
  ].join("\n");
}

/** "balance enero 1999": antes del primer mes que se puede ver (el mismo límite de la web). */
export const tooOldMonthReply = (locale: Locale) => TEXTS[locale].tooOldMonth;

/** "balance diciembre 2026" cuando todavía es octubre de 2026. */
export const futureMonthReply = (month: Month, locale: Locale) => TEXTS[locale].futureMonth(formatMonthLabel(month, locale));

/** Cuántas categorías nombra el reporte ("En qué se te fue"). */
export const REPORT_CATEGORIES = 3;

/**
 * "reporte" (o "reporte 2025"): lo de Reportes en la web, en un mensaje. Las cifras del período, las
 * categorías que más sumaron, los gastos fijos y el enlace a Reportes para ver el resto. `period` y las
 * categorías ya vienen en el idioma de la cuenta.
 */
export function reportReply(
  // De los gastos fijos solo hacen falta cuántos son y lo que suman.
  report: { summary: PeriodSummary; categories: CategoryReport; recurring: Pick<RecurringReport, "total"> & { items: readonly unknown[] } },
  period: ReportPeriod,
  ctx: { currency: string; appUrl: string; locale: Locale },
): string {
  const { locale } = ctx;
  const t = TEXTS[locale];
  const money = (n: number) => formatMoney(n, ctx.currency, locale);
  const link = `${ctx.appUrl}${periodHref(period.id)}`;
  const { summary, categories, recurring } = report;
  // Dentro de una frase: en español, en minúscula ("de noviembre de 2025…"); en inglés, los meses van con mayúscula.
  const range = locale === "es" ? period.range.charAt(0).toLowerCase() + period.range.slice(1) : period.range;
  const single = period.months.length === 1;
  if (summary.income === 0 && summary.expense === 0) {
    return `${t.noReportTransactions(range, single)}. ${t.tryWriting} ${t.reportSeeHere}.`;
  }
  const saved =
    summary.saved === "overspent" ? ` (${t.overspent})` : summary.saved ? ` (${t.saved(formatPercent(summary.saved, locale))})` : "";
  const top = categories.rows
    .slice(0, REPORT_CATEGORIES)
    .map((row) => `${row.emoji} ${row.name} ${formatPercent(formatShare(row.total, categories.total), locale)}`);
  return [
    `📊 *${t.reportTitle(range, single)}*`,
    `${t.income}: ${money(summary.income)}`,
    `${t.expenses}: ${money(summary.expense)}`,
    `Balance: *${money(summary.balance)}*${saved}`,
    ...(summary.averageExpense ? [`${t.average}: ${money(summary.averageExpense.amount)}`] : []),
    ...(summary.topMonth
      ? [`${t.topMonth}: ${formatMonthName(summary.topMonth.month, { withYear: true, locale })} (${money(summary.topMonth.expense)})`]
      : []),
    ...(top.length > 0 ? [`${t.whereItWent}: ${top.join(" · ")}`] : []),
    ...(recurring.items.length > 0 ? [t.bills(money(recurring.total))] : []),
    "",
    `${t.moreDetail}: ${link}`,
  ].join("\n");
}

/** "reporte 2027" cuando todavía es 2026. */
export const futureYearReply = (year: number, locale: Locale) => TEXTS[locale].futureYear(year);

/** "reporte 1999": antes del primer año que se puede ver (el mismo límite de la web). */
export const tooOldYearReply = (locale: Locale) => TEXTS[locale].tooOldYear;

export function undoReply(removed: { description: string; amount: number; type: string }[], currency: string, locale: Locale) {
  const t = TEXTS[locale];
  if (removed.length === 0) return t.nothingToUndo;
  const lines = removed.map((item) => `🗑️ ${item.description} — ${formatMoney(item.amount, currency, locale)}`);
  return [t.undone, ...lines].join("\n");
}

// Los ejemplos y los comandos salen de src/modules/bot/help.ts (los mismos de la página Ayuda de la web).
export function helpReply(locale: Locale, name?: string) {
  const t = TEXTS[locale];
  return [
    t.hi(firstName(name)),
    t.writeLikeThis,
    "",
    ...BOT_EXAMPLES[locale].map((example) => `• _${example}_`),
    "",
    t.photo,
    "",
    t.alsoUnderstand,
    ...BOT_COMMANDS[locale].map(
      (c) =>
        `• *${c.command}*${c.alternative ? ` ${t.or} *${c.alternative}*` : ""} — ${c.description}${c.also ? ` (${t.or} *${c.also.command}*, ${c.also.description})` : ""}`,
    ),
  ].join("\n");
}

/**
 * A un número sin vincular: todavía no se sabe de qué cuenta es (ni su idioma), así que va en español y, debajo,
 * en inglés. Se vincula con "VINCULAR 123456" o "LINK 123456" (src/modules/bot/commands.ts): solo el código no sirve.
 */
export const notLinkedReply = (appUrl: string) =>
  [TEXTS.es.hi(""), ...TEXTS.es.notLinked(appUrl), "", TEXTS.en.hi(""), ...TEXTS.en.notLinked(appUrl)].join("\n");

export const linkedReply = (name: string, locale: Locale) => TEXTS[locale].linked(firstName(name));

export const suspendedReply = (locale: Locale) => TEXTS[locale].suspended;

/** Con el código equivocado no se sabe de qué cuenta es: va en el idioma de la palabra que usó ("VINCULAR" o "LINK"). */
export const linkInvalidReply = (locale: Locale) => TEXTS[locale].linkInvalid;
export const linkRateLimitedReply = (locale: Locale) => TEXTS[locale].linkRateLimited;
export const unsupportedTypeReply = (locale: Locale) => TEXTS[locale].unsupportedType;

export const photoFallbackReply = (locale: Locale) => TEXTS[locale].photoFallback(TEXTS[locale].writeIt);
export const photoUnreadableReply = (locale: Locale) => TEXTS[locale].photoUnreadable(TEXTS[locale].writeIt);
export const photoManyReply = (locale: Locale) => TEXTS[locale].photoMany(TEXTS[locale].writeIt);
export const photoFormatReply = (locale: Locale) => TEXTS[locale].photoFormat(TEXTS[locale].writeIt);
export const photoDownloadFailedReply = (locale: Locale) => TEXTS[locale].photoDownloadFailed(TEXTS[locale].writeIt);
export const errorReply = (locale: Locale) => TEXTS[locale].error;

export const tooLongReply = (locale: Locale) => TEXTS[locale].tooLong;
export const notUnderstoodReply = (locale: Locale) => TEXTS[locale].notUnderstood;
export const amountUnclearReply = (locale: Locale) => TEXTS[locale].amountUnclear;

export const aiRateLimitedReply = (locale: Locale) => TEXTS[locale].aiRateLimited;
export const tooManyTransactionsReply = (max: number, locale: Locale) => TEXTS[locale].tooManyTransactions(max);
/** Cuando el admin pausó Claude en /admin/bot: los comandos siguen, el texto libre se registra en la web. */
export const aiPausedReply = (appUrl: string, locale: Locale) =>
  `${TEXTS[locale].aiPaused} ${TEXTS[locale].registerOnWeb(appUrl)} ${TEXTS[locale].stillWorking}`;
/** Cuando se usó el tope mensual de tokens de /admin/bot: hasta el mes siguiente, como en pausa. */
export const aiMonthlyLimitReply = (appUrl: string, locale: Locale) =>
  `${TEXTS[locale].aiMonthlyLimit} ${TEXTS[locale].registerOnWeb(appUrl)} ${TEXTS[locale].stillWorking}`;
export const aiUnavailableReply = (locale: Locale) => TEXTS[locale].aiUnavailable;
