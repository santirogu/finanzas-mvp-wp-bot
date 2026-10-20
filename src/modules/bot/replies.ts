// Textos que el bot envía por WhatsApp. WhatsApp usa *negrita* y _cursiva_.
import { CONTACT_EMAIL } from "@/lib/contact";
import { formatMonthLabel, formatMonthName, formatShortDate, type Month, type MonthRange } from "@/lib/dates";
import { formatMoney, formatShare } from "@/lib/money";
import type { CategoryReport } from "@/modules/reports/categories";
import { periodHref, type ReportPeriod } from "@/modules/reports/period";
import type { RecurringReport } from "@/modules/reports/recurring";
import type { PeriodSummary } from "@/modules/reports/summary";
import { balanceChange } from "@/modules/transactions/month-comparison";
import { BOT_COMMANDS, BOT_EXAMPLES } from "./help";
import type { ParsedTransaction } from "./normalize";

export function registeredReply(
  items: ParsedTransaction[],
  ctx: { today: string; currency: string; balance: number; range: MonthRange },
): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  const lines = items.map((t) => {
    const label = t.type === "income" ? "Ingreso" : "Egreso";
    const extras = [t.category, t.occurredOn !== ctx.today ? formatShortDate(t.occurredOn) : null]
      .filter(Boolean)
      .join(" · ");
    return `✅ ${label} registrado: *${t.description}* — ${money(t.amount)}${extras ? ` (${extras})` : ""}`;
  });
  return [
    ...lines,
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
 * más con cómo cambió el balance, solo si ese mes tuvo movimientos.
 */
export function balanceReply(
  summary: Summary,
  ctx: { currency: string; range: Month; previous?: { month: Month; summary: Summary } },
): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  if (summary.count === 0) {
    return `Aún no tienes movimientos en ${formatMonthLabel(ctx.range).toLowerCase()}. Escríbeme algo como “gasté 20 mil en almuerzo”.`;
  }
  const previous = ctx.previous && ctx.previous.summary.count > 0 ? ctx.previous : null;
  const change = previous
    ? balanceChange(summary.balance, previous.summary.balance, formatMonthName(previous.month), ctx.currency)
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
  `${formatMonthLabel(month)} todavía no llega 🙂 Prueba con *balance* (este mes) o *balance mes pasado*.`;

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
    summary.saved === "overspent" ? " (gastaste más de lo que ganaste)" : summary.saved ? ` (ahorraste el ${summary.saved}%)` : "";
  const top = categories.rows
    .slice(0, REPORT_CATEGORIES)
    .map((row) => `${row.emoji} ${row.name} ${formatShare(row.total, categories.total)}%`);
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
    `Más detalle: ${link}`,
  ].join("\n");
}

/** "reporte 2027" cuando todavía es 2026. */
export const futureYearReply = (year: number) =>
  `${year} todavía no llega 🙂 Prueba con *reporte* (los últimos 12 meses) o *reporte* y un año que ya pasó.`;

/** "reporte 1999": antes del primer año que se puede ver (el mismo límite de la web). */
export const tooOldYearReply = "Solo puedo darte reportes desde el 2000. Prueba con *reporte* (los últimos 12 meses) o *reporte 2025*.";

export function undoReply(
  removed: { description: string; amount: number; type: string }[],
  currency: string,
) {
  if (removed.length === 0) return "No encontré registros hechos por WhatsApp para deshacer.";
  const lines = removed.map((t) => `🗑️ ${t.description} — ${formatMoney(t.amount, currency)}`);
  return [`Listo, eliminé:`, ...lines].join("\n");
}

// Los ejemplos y los comandos salen de src/modules/bot/help.ts (los mismos de la página Ayuda de la web).
export const helpReply = (name?: string) =>
  [
    `Hola${name ? ` ${name.split(" ")[0]}` : ""} 👋 Escríbeme tus ingresos y gastos como se los contarías a alguien:`,
    "",
    ...BOT_EXAMPLES.map((example) => `• _${example}_`),
    "",
    "También entiendo:",
    ...BOT_COMMANDS.map(
      (c) =>
        `• *${c.command}*${"alternative" in c ? ` o *${c.alternative}*` : ""} — ${c.description}${"note" in c ? ` (${c.note})` : ""}`,
    ),
  ].join("\n");

export const notLinkedReply = (appUrl: string) =>
  `Hola 👋 Este número aún no está vinculado a una cuenta. Entra a ${appUrl}/cuenta (Mi cuenta), toca *Conectar WhatsApp* y envíame el código que te aparece.`;

export const linkedReply = (name: string) =>
  `✅ ¡Listo${name ? `, ${name.split(" ")[0]}` : ""}! Tu WhatsApp quedó vinculado.\n\nPrueba escribiéndome: _gasté 20 mil en almuerzo_`;

// Cuenta suspendida por el admin: no se registra nada y no se dice el motivo.
export const suspendedReply = `Tu cuenta está suspendida, así que no puedo registrar movimientos. Si crees que es un error, escríbenos a ${CONTACT_EMAIL}.`;

export const linkInvalidReply =
  "Ese código no es válido o ya venció. Genera uno nuevo en Mi cuenta.";
export const linkRateLimitedReply =
  "Demasiados intentos fallidos. Espera una hora antes de volver a intentar.";
export const unsupportedTypeReply = "Por ahora solo entiendo mensajes de texto ✍️";
export const errorReply =
  "Tuve un problema procesando tu mensaje 😕 Intenta de nuevo en un momento.";
export const aiRateLimitedReply =
  "Recibí muchos mensajes en poco tiempo. Para cuidar el servicio, espera un rato antes de registrar más. Mientras tanto puedes escribir *balance*, *reporte* o *deshacer*, o usar la web.";
export const tooManyTransactionsReply = (max: number) =>
  `Son muchos movimientos en un solo mensaje. Envíame máximo ${max} por mensaje y los registro.`;
/** Cuando el admin pausó Claude en /admin/bot: los comandos siguen, el texto libre se registra en la web. */
export const aiPausedReply = (appUrl: string) =>
  `Por ahora no puedo entender mensajes escritos libremente 🛠️ Registra tus movimientos en la web: ${appUrl}/dashboard. *balance*, *reporte*, *deshacer* y *ayuda* siguen funcionando.`;
/** Cuando se usó el tope mensual de tokens de /admin/bot: hasta el mes siguiente, como en pausa. */
export const aiMonthlyLimitReply = (appUrl: string) =>
  `Este mes ya usé todo mi cupo para entender mensajes escritos libremente 🛠️ Registra tus movimientos en la web: ${appUrl}/dashboard. *balance*, *reporte*, *deshacer* y *ayuda* siguen funcionando.`;
export const aiUnavailableReply =
  "Por ahora solo entiendo *balance*, *reporte*, *deshacer* y *ayuda*. Muy pronto podrás registrar gastos escribiendo normal ✍️";
