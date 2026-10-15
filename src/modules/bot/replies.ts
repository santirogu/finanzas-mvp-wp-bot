// Textos que el bot envía por WhatsApp. WhatsApp usa *negrita* y _cursiva_.
import { CONTACT_EMAIL } from "@/lib/contact";
import { formatMonthLabel, formatShortDate, type MonthRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
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

export function balanceReply(
  summary: { income: number; expense: number; balance: number; count: number },
  ctx: { currency: string; range: MonthRange },
): string {
  const money = (n: number) => formatMoney(n, ctx.currency);
  if (summary.count === 0) {
    return `Aún no tienes movimientos en ${formatMonthLabel(ctx.range).toLowerCase()}. Escríbeme algo como “gasté 20 mil en almuerzo”.`;
  }
  return [
    `📊 *${formatMonthLabel(ctx.range)}*`,
    `Ingresos: ${money(summary.income)}`,
    `Egresos: ${money(summary.expense)}`,
    `Balance: *${money(summary.balance)}*`,
  ].join("\n");
}

export function undoReply(
  removed: { description: string; amount: number; type: string }[],
  currency: string,
) {
  if (removed.length === 0) return "No encontré registros hechos por WhatsApp para deshacer.";
  const lines = removed.map((t) => `🗑️ ${t.description} — ${formatMoney(t.amount, currency)}`);
  return [`Listo, eliminé:`, ...lines].join("\n");
}

export const helpReply = (name?: string) =>
  [
    `Hola${name ? ` ${name.split(" ")[0]}` : ""} 👋 Escríbeme tus ingresos y gastos como se los contarías a alguien:`,
    "",
    "• _me compré unos zapatos de $500.000_",
    "• _almuerzo 25 mil y taxi 12 mil_",
    "• _me pagaron la quincena 2.100.000_",
    "",
    "También entiendo:",
    "• *balance* — cómo vas este mes",
    "• *deshacer* — borra el último registro",
  ].join("\n");

export const notLinkedReply = (appUrl: string) =>
  `Hola 👋 Este número aún no está vinculado a una cuenta. Entra a ${appUrl}/dashboard, toca *Conectar WhatsApp* y envíame el código que te aparece.`;

export const linkedReply = (name: string) =>
  `✅ ¡Listo${name ? `, ${name.split(" ")[0]}` : ""}! Tu WhatsApp quedó vinculado.\n\nPrueba escribiéndome: _gasté 20 mil en almuerzo_`;

// Cuenta suspendida por el admin: no se registra nada y no se dice el motivo.
export const suspendedReply = `Tu cuenta está suspendida, así que no puedo registrar movimientos. Si crees que es un error, escríbenos a ${CONTACT_EMAIL}.`;

export const linkInvalidReply =
  "Ese código no es válido o ya venció. Genera uno nuevo en el dashboard.";
export const linkRateLimitedReply =
  "Demasiados intentos fallidos. Espera una hora antes de volver a intentar.";
export const unsupportedTypeReply = "Por ahora solo entiendo mensajes de texto ✍️";
export const errorReply =
  "Tuve un problema procesando tu mensaje 😕 Intenta de nuevo en un momento.";
export const aiUnavailableReply =
  "Por ahora solo entiendo *balance*, *deshacer* y *ayuda*. Muy pronto podrás registrar gastos escribiendo normal ✍️";
