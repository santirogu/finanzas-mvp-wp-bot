// Textos que el bot envía por WhatsApp. WhatsApp usa *negrita* y _cursiva_.
import { CONTACT_EMAIL } from "@/lib/contact";
import { formatMonthLabel, formatMonthName, formatShortDate, type Month, type MonthRange } from "@/lib/dates";
import { BRAND_NAME } from "@/lib/brand";
import { formatMoney, formatPercent, formatShare } from "@/lib/money";
import type { CategoryReport } from "@/modules/reports/categories";
import { periodHref, type ReportPeriod } from "@/modules/reports/period";
import type { RecurringReport } from "@/modules/reports/recurring";
import type { PeriodSummary } from "@/modules/reports/summary";
import { balanceChange, previousMonthReference } from "@/modules/transactions/month-comparison";
import { BOT_COMMANDS, BOT_EXAMPLES } from "./help";
import type { ParsedTransaction } from "./normalize";

// El emoji de cada aviso de presupuesto: llegar al 80 % o pasarse.
const BUDGET_ALERT_EMOJI = { near: "⚠️", over: "🚨" } as const;

/**
 * Lo que se registró, los avisos de los presupuestos que cruzaron un umbral con eso (`budgetAlerts`, ya armados con
 * budgetAlert) y el balance del mes.
 */
export function registeredReply(
  items: ParsedTransaction[],
  ctx: {
    today: string;
    currency: string;
    balance: number;
    range: MonthRange;
    budgetAlerts?: { level: keyof typeof BUDGET_ALERT_EMOJI; text: string }[];
  },
): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  const lines = items.map((t) => {
    const label = t.type === "income" ? "Ingreso" : "Egreso";
    const extras = [t.category, t.occurredOn !== ctx.today ? formatShortDate(t.occurredOn) : null]
      .filter(Boolean)
      .join(" · ");
    // "Egreso Anotado": con la marca (y su mayúscula, por decisión del dueño) y el tipo, que es como se nota si
    // Claude tomó un ingreso por un egreso.
    return `✅ ${label} ${BRAND_NAME}: *${t.description}* — ${money(t.amount)}${extras ? ` (${extras})` : ""}`;
  });
  const alerts = (ctx.budgetAlerts ?? []).map((alert) => `${BUDGET_ALERT_EMOJI[alert.level]} ${alert.text}`);
  return [
    ...lines,
    ...(alerts.length > 0 ? ["", ...alerts] : []),
    "",
    `Balance de ${formatMonthLabel(ctx.range).split(" de ")[0].toLowerCase()}: *${money(ctx.balance)}*`,
    "_Escribe *deshacer* si me equivoqué._",
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
  ctx: { currency: string; range: Month; previous?: { month: Month; summary: Summary; upToToday: boolean } },
): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  if (summary.count === 0) {
    return `Aún no tienes movimientos en ${formatMonthLabel(ctx.range).toLowerCase()}. Escríbeme algo como “gasté 20 mil en almuerzo”.`;
  }
  const previous = ctx.previous && ctx.previous.summary.count > 0 ? ctx.previous : null;
  const change = previous
    ? balanceChange(
        summary.balance,
        previous.summary.balance,
        previousMonthReference(formatMonthName(previous.month), previous.upToToday),
        ctx.currency,
      )
    : null;
  return [
    `📊 *${formatMonthLabel(ctx.range)}*`,
    `Ingresos: ${money(summary.income)}`,
    `Egresos: ${money(summary.expense)}`,
    `Balance: *${money(summary.balance)}*`,
    ...(change ? [`_${CHANGE_ARROWS[change.direction]}${change.text}_`] : []),
  ].join("\n");
}

/** "balance enero 1999": antes del primer mes que se puede ver (el mismo límite de la web). */
export const tooOldMonthReply =
  "Solo puedo darte balances desde enero de 2000. Prueba con *balance* (este mes) o *balance mes pasado*.";

/** "balance diciembre 2026" cuando todavía es octubre de 2026. */
export const futureMonthReply = (month: Month) =>
  `${formatMonthLabel(month)} todavía no llega 🙂. Prueba con *balance* (este mes) o *balance mes pasado*.`;

/** Cuántas categorías nombra el reporte ("En qué se te fue"). */
export const REPORT_CATEGORIES = 3;

/**
 * "reporte" (o "reporte 2025"): lo de Reportes en la web, en un mensaje. Las cifras del período, las
 * categorías que más sumaron, los gastos fijos y el enlace a Reportes para ver el resto.
 */
export function reportReply(
  // De los gastos fijos solo hacen falta cuántos son y lo que suman.
  report: { summary: PeriodSummary; categories: CategoryReport; recurring: Pick<RecurringReport, "total"> & { items: readonly unknown[] } },
  period: ReportPeriod,
  ctx: { currency: string; appUrl: string },
): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  const link = `${ctx.appUrl}${periodHref(period.id)}`;
  const { summary, categories, recurring } = report;
  // "De noviembre de 2025 a octubre de 2026" o, si es un solo mes, "Enero de 2026": dentro de una frase.
  const range = period.range.charAt(0).toLowerCase() + period.range.slice(1);
  const single = period.months.length === 1;
  if (summary.income === 0 && summary.expense === 0) {
    return `No tienes movimientos ${single ? `en ${range}` : range}. Escríbeme algo como “gasté 20 mil en almuerzo” y aquí verás cómo te va.`;
  }
  const saved =
    summary.saved === "overspent" ? " (gastaste más de lo que ganaste)" : summary.saved ? ` (ahorraste el ${formatPercent(summary.saved)})` : "";
  const top = categories.rows
    .slice(0, REPORT_CATEGORIES)
    .map((row) => `${row.emoji} ${row.name} ${formatPercent(formatShare(row.total, categories.total))}`);
  return [
    `📊 *Reporte ${single ? `de ${range}` : range}*`,
    `Ingresos: ${money(summary.income)}`,
    `Egresos: ${money(summary.expense)}`,
    `Balance: *${money(summary.balance)}*${saved}`,
    ...(summary.averageExpense ? [`Gasto promedio por mes: ${money(summary.averageExpense.amount)}`] : []),
    ...(summary.topMonth
      ? [`Mes de más gasto: ${formatMonthName(summary.topMonth.month, { withYear: true })} (${money(summary.topMonth.expense)})`]
      : []),
    ...(top.length > 0 ? [`En qué se te fue: ${top.join(" · ")}`] : []),
    ...(recurring.items.length > 0 ? [`Gastos fijos: ${money(recurring.total)} al mes`] : []),
    "",
    `Más detalle en *Reportes*: ${link}`,
  ].join("\n");
}

/** "reporte 2027" cuando todavía es 2026. */
export const futureYearReply = (year: number) =>
  `${year} todavía no llega 🙂. Prueba con *reporte* (los últimos 12 meses) o *reporte* y un año que ya pasó.`;

/** "reporte 1999": antes del primer año que se puede ver (el mismo límite de la web). */
export const tooOldYearReply = "Solo puedo darte reportes desde el 2000. Prueba con *reporte* (los últimos 12 meses) o *reporte 2025*.";

export function undoReply(
  removed: { description: string; amount: number; type: string }[],
  currency: string,
) {
  if (removed.length === 0) return "No encontré movimientos registrados por WhatsApp para deshacer.";
  const lines = removed.map((t) => `🗑️ ${t.description} — ${formatMoney(t.amount, currency)}`);
  return [`Listo, eliminé:`, ...lines].join("\n");
}

// Los ejemplos y los comandos salen de src/modules/bot/help.ts (los mismos de la página Ayuda de la web).
export const helpReply = (name?: string) =>
  [
    `Hola${name ? `, ${name.split(" ")[0]}` : ""} 👋`,
    "Escríbeme tus ingresos y gastos como se los contarías a alguien:",
    "",
    ...BOT_EXAMPLES.map((example) => `• _${example}_`),
    "",
    "📸 O envíame la foto de una factura y registro el total.",
    "",
    "También entiendo:",
    ...BOT_COMMANDS.map(
      (c) =>
        `• *${c.command}*${"alternative" in c ? ` o *${c.alternative}*` : ""} — ${c.description.es}${"also" in c ? ` (o *${c.also.command}*, ${c.also.description.es})` : ""}`,
    ),
  ].join("\n");

// Se vincula con "VINCULAR 123456" (src/modules/bot/commands.ts): solo el código no sirve.
export const notLinkedReply = (appUrl: string) =>
  [
    "Hola 👋",
    `Este número aún no está vinculado a una cuenta. Entra a ${appUrl}/cuenta (*Mi cuenta*), toca *Conectar WhatsApp* y envíame el mensaje que te aparece: *VINCULAR* y el código.`,
    "",
    `Si no tienes cuenta, créala en ${appUrl}/registro.`,
  ].join("\n");

export const linkedReply = (name: string) =>
  `✅ ¡Listo${name ? `, ${name.split(" ")[0]}` : ""}! Tu WhatsApp quedó vinculado.\n\nPrueba escribiéndome: _gasté 20 mil en almuerzo_`;

// Cuenta suspendida por el admin: no se registra nada, tampoco responde los comandos, y no se dice el motivo.
export const suspendedReply = `Tu cuenta está suspendida, así que no puedo registrar movimientos ni responder tus consultas. Si crees que es un error, escríbenos a ${CONTACT_EMAIL}.`;

export const linkInvalidReply =
  "Ese código no es válido o ya venció. Pide otro en *Mi cuenta*: toca *Conectar WhatsApp*.";
export const linkRateLimitedReply =
  "Recibí demasiados códigos equivocados desde este número. Espera una hora y vuelve a intentarlo.";
export const unsupportedTypeReply = "Por ahora solo entiendo mensajes de texto ✍️ y fotos de facturas 🧾";

// Las fotos de facturas (src/modules/bot/interpret.ts → interpretPhoto): cuando no quedó registrada, cómo seguir.
const WRITE_IT = "escríbeme el gasto, por ejemplo “almuerzo 25 mil”";
export const photoFallbackReply = `No encontré una factura en la foto. Envíame una foto más clara del recibo o ${WRITE_IT}.`;
export const photoUnreadableReply = `No logré leer el total de la factura. Envíame una foto más clara o ${WRITE_IT}.`;
export const photoManyReply = `No registré nada: necesito una sola factura por foto. Envíamelas una por una o ${WRITE_IT}.`;
export const photoFormatReply = `No pude abrir esa imagen. Envíame la factura como foto o ${WRITE_IT}.`;
// No se descargó (Meta no respondió): puede ser pasajero.
export const photoDownloadFailedReply = `No pude descargar tu foto 😕. Envíamela de nuevo en un momento o ${WRITE_IT}.`;
// El error puede llegar después de guardar (handle-message.ts): que revise antes de enviarlo de nuevo, para no
// registrarlo dos veces.
export const errorReply =
  "Tuve un problema con tu mensaje 😕. Revisa en la web si quedó y, si no, envíamelo de nuevo en un momento.";

// Cuando el texto libre no se registra (tope, pausa, sin Claude): lo primero que dice es que no quedó, para que
// la persona no crea que lo anotó.
const STILL_WORKING = "Siguen funcionando *balance*, *reporte*, *deshacer* y *ayuda*.";
const registerOnWeb = (appUrl: string) => `Regístralo en la web, en *Egresos* o *Ingresos*: ${appUrl}/egresos.`;

export const aiRateLimitedReply =
  "No registré este mensaje: recibí muchos en poco tiempo. Espera un rato y envíamelo de nuevo. Mientras tanto, puedes escribir *balance*, *reporte*, *deshacer* o *ayuda*, o registrarlo en la web.";
export const tooManyTransactionsReply = (max: number) =>
  `No registré ninguno: tu mensaje trae más de ${max} movimientos. Envíamelos en varios mensajes, hasta ${max} en cada uno.`;
/** Cuando el admin pausó Claude en /admin/bot: los comandos siguen, el texto libre se registra en la web. */
export const aiPausedReply = (appUrl: string) =>
  `No registré tu mensaje: por ahora no puedo entender mensajes escritos libremente ni fotos 🛠️. ${registerOnWeb(appUrl)} ${STILL_WORKING}`;
/** Cuando se usó el tope mensual de tokens de /admin/bot: hasta el mes siguiente, como en pausa. */
export const aiMonthlyLimitReply = (appUrl: string) =>
  `No registré tu mensaje: este mes ya usé todo mi cupo para entender mensajes escritos libremente y fotos 🛠️. ${registerOnWeb(appUrl)} ${STILL_WORKING}`;
export const aiUnavailableReply =
  "No registré tu mensaje: por ahora solo entiendo *balance*, *reporte*, *deshacer* y *ayuda*. Muy pronto podrás registrar tus movimientos escribiendo como hablas ✍️.";
