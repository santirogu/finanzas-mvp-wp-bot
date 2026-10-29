// Comandos fijos del bot. Se resuelven con expresiones regulares, sin llamar a la IA:
// son más rápidos, gratis y 100 % predecibles. Se entienden en español y en inglés, sea cual sea el idioma
// de la cuenta (decisión del dueño): "reporte" y "report" piden lo mismo.
import type { Locale } from "@/i18n/locales";
import { compareMonths, FIRST_MONTH, type Month, shiftMonth } from "@/lib/dates";

/** El mes que pide "balance septiembre" (con o sin año) o "balance mes pasado". */
export type BalancePeriod = { month: number; year?: number } | "previous";

/** El período que pide "reporte": un año ("reporte 2025") o el actual ("reporte del año"); sin decir, los últimos 12 meses. */
export type ReportAsk = { year: number } | "this-year";

export type BotCommand =
  | { kind: "command"; command: "balance"; period?: BalancePeriod }
  | { kind: "command"; command: "report"; period?: ReportAsk }
  | { kind: "command"; command: "undo" | "help" }
  // `locale`: el de la palabra que se usó ("VINCULAR" o "LINK"). Si el código no sirve, no se sabe de qué cuenta
  // es: el bot le contesta en ese idioma.
  | { kind: "link"; code: string; locale: Locale };

// En minúscula, sin tildes ni signos de pregunta o exclamación y sin espacios en los extremos (al final:
// "reporte !" queda "reporte"). El apóstrofo curvo del teclado del iPhone ("what’s") queda recto.
const strip = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.]/g, "")
    .replace(/[’‘]/g, "'")
    .trim();

// "balance", "mi saldo", "resumen del mes"; "my balance", "what's my balance", "summary this month" (las
// preguntas, como "¿cuánto llevo?", van en ASK_CURRENT).
const BALANCE_WORD = "(?:balance|saldo|resumen|summary)";
const BALANCE = new RegExp(`^(?:mi |my |what's my |what is my )?${BALANCE_WORD}(?: del mes| this month)?$`);

// Los meses como se escriben (sin tildes: `strip` ya las quitó), con sus abreviaturas, en los dos idiomas. Las
// que comparten ("mar", "may", "jun", "jul", "sep", "oct", "nov") son el mismo mes.
const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, january: 1, jan: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sept: 9, sep: 9, set: 9, september: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12,
};
const MONTH_WORD = "([a-z]+)";
const YEAR = "(?: (?:de |del |of )?(\\d{4}))?";
// "balance septiembre", "saldo de agosto", "resumen del mes de marzo", "balance sept 2025"; "balance for
// september", "summary of march 2025".
const BALANCE_MONTH = new RegExp(`^(?:mi |my )?${BALANCE_WORD}(?: del mes de| de| del| for| of| in)? ${MONTH_WORD}${YEAR}$`);
// En inglés, también con el mes primero: "september balance", "my march 2025 summary".
const MONTH_BALANCE = new RegExp(`^(?:my )?${MONTH_WORD}${YEAR} ${BALANCE_WORD}$`);
// "balance mes pasado", "saldo del mes anterior"; "balance last month", "balance for the previous month", "last
// month's balance".
const PREVIOUS_MONTH = new RegExp(
  `^(?:(?:mi |my )?${BALANCE_WORD}(?: del?| for| of)? (?:mes (?:pasado|anterior)|(?:the )?(?:last|previous) month)|(?:my )?(?:last|previous) month(?:'s)? ${BALANCE_WORD})$`,
);

// Las preguntas por los totales, como se hacen: "¿cuánto gasté…?", "¿cuántos fueron mis ingresos…?",
// "¿cuánto gané…?", "¿cómo me fue…?"; "how much did I spend…?", "how am I doing…?". Responden lo mismo que
// "balance": ingresos, egresos y balance.
const ASKING = [
  "cuanto (?:llevo|tengo|he gastado|gaste|gane|recibi|ingrese|he ganado|he recibido|me entro|me entraron|me pagaron)(?: gastado| ganado)?",
  "cuant(?:o|os|as) (?:fue|fueron|son|van|llevo|llevan) (?:(?:mis|los|las) )?(?:ingresos|egresos|gastos)",
  "cuant(?:os|as) (?:ingresos|egresos|gastos) (?:tuve|tengo|llevo|hubo)",
  "como me (?:fue|va)",
  "how much (?:money )?(?:did i|have i|i've|i have) (?:spend|spent|earn|earned|make|made|get|got|receive|received)",
  "how (?:am i doing|did i do)",
  "what (?:are|were) my (?:income|expenses|spending)",
].join("|");
// Solo los totales ("mis ingresos de septiembre", "my expenses in august"): con el mes dicho; solos, no (podrían
// ser otra cosa).
const TOTALS = "(?:(?:mis|los|las|my) )?(?:ingresos|egresos|gastos|income|expenses|spending)";
const IN_MONTH = ` (?:en|de|del mes de|en el mes de|in|for|during) ${MONTH_WORD}${YEAR}`;
// "cuánto gasté en septiembre", "mis ingresos de agosto de 2025", "cómo me fue en marzo", "how much did I spend
// in september".
const ASK_MONTH = new RegExp(`^(?:${ASKING}|${TOTALS})${IN_MONTH}$`);
// "cuánto gasté el mes pasado", "gastos del mes anterior", "how did I do last month".
const ASK_PREVIOUS = new RegExp(`^(?:${ASKING}|${TOTALS}) (?:(?:el|en el|del) mes (?:pasado|anterior)|(?:in |for )?(?:the )?(?:last|previous) month)$`);
// "cuánto gané este mes", "cuántos fueron mis ingresos", "mis gastos del mes", "cómo me va", "how much did I
// spend this month", "my expenses this month".
const ASK_CURRENT = new RegExp(
  `^(?:(?:${ASKING})(?: este mes| en este mes| del mes| this month)?|${TOTALS}(?: este mes| en este mes| del mes| this month))$`,
);

/** El número del mes que se escribió ("sept" → 9); null si no es un mes. */
function monthNumber(word: string): number | null {
  return Object.hasOwn(MONTHS, word) ? MONTHS[word] : null;
}

/** "balance septiembre 2025" → { month: 9, year: 2025 }; null si no pide un mes. */
function balancePeriod(text: string): BalancePeriod | null {
  if (PREVIOUS_MONTH.test(text) || ASK_PREVIOUS.test(text)) return "previous";
  const match = BALANCE_MONTH.exec(text) ?? MONTH_BALANCE.exec(text) ?? ASK_MONTH.exec(text);
  const month = match ? monthNumber(match[1]) : null;
  if (!match || !month) return null;
  return match[2] ? { month, year: Number(match[2]) } : { month };
}

/**
 * El mes del balance que se pidió, visto desde el mes actual: sin año, el último que ya pasó con ese
 * nombre (en octubre, "noviembre" es el del año pasado y "octubre", este). `future` si pidió uno que
 * todavía no llega ("diciembre 2026" en octubre de 2026); `tooOld` si es de antes de FIRST_MONTH (no
 * hay movimientos, y un año de menos de 4 cifras ni siquiera es una fecha que entienda la base).
 */
export function balanceMonth(
  period: BalancePeriod | undefined,
  current: Month,
): { month: Month } | { future: Month } | { tooOld: true } {
  if (!period) return { month: { year: current.year, month: current.month } };
  if (period === "previous") return { month: shiftMonth(current, -1) };
  if (period.year === undefined) {
    const thisYear = { year: current.year, month: period.month };
    return { month: compareMonths(thisYear, current) > 0 ? { year: current.year - 1, month: period.month } : thisYear };
  }
  const month = { year: period.year, month: period.month };
  if (compareMonths(month, FIRST_MONTH) < 0) return { tooOld: true };
  return compareMonths(month, current) > 0 ? { future: month } : { month };
}
// "reporte", "informe", "mi reporte", "reporte de los últimos 12 meses"; "report", "my report", "report for the
// last 12 months" (lo de Reportes en la web). Con año: "reporte 2025", "informe del 2025", "reporte del año 2025",
// "report for 2025", "2025 report"; el actual: "reporte del año", "reporte de este año", "reporte anual", "report
// for this year", "annual report". `strip` ya quitó las tildes: "año" llega como "ano".
const REPORT_WORD = "(?:mi |el |my |the )?(?:reporte|informe|report)";
const REPORT = new RegExp(`^${REPORT_WORD}(?: (?:de los )?ultimos 12 meses| (?:for |of )?(?:the )?last 12 months)?$`);
const REPORT_YEAR = new RegExp(`^${REPORT_WORD}(?: del| de| for| of)?(?: ano| the year)? (\\d{1,4})$`);
const YEAR_REPORT = /^(?:my |the )?(\d{4}) report$/;
const REPORT_THIS_YEAR = new RegExp(
  `^(?:${REPORT_WORD} (?:(?:del|de este|este) ano|anual|(?:for |of )?this year)|(?:my |the )?(?:annual|yearly|this year's) report)$`,
);

/** "reporte 2025" → { year: 2025 }; "reporte del año" → "this-year"; "reporte" → undefined; null si no es un reporte. */
function reportAsk(text: string): { period?: ReportAsk } | null {
  if (REPORT.test(text)) return {};
  if (REPORT_THIS_YEAR.test(text)) return { period: "this-year" };
  const match = REPORT_YEAR.exec(text) ?? YEAR_REPORT.exec(text);
  return match ? { period: { year: Number(match[1]) } } : null;
}

/**
 * El período de Reportes que se pidió (el `?periodo=` de la web), visto desde el mes actual. `future`
 * si pidió un año que todavía no llega; `tooOld` si es de antes de FIRST_MONTH.
 */
export function reportYear(period: ReportAsk | undefined, current: Month): { id?: string } | { future: number } | { tooOld: true } {
  if (!period) return {};
  const year = period === "this-year" ? current.year : period.year;
  if (year < FIRST_MONTH.year) return { tooOld: true };
  if (year > current.year) return { future: year };
  return { id: String(year) };
}

const UNDO = /^(?:deshacer|anular|borrar|eliminar|undo|delete|remove)(?: (?:el )?ultimo| (?:the )?last(?: one)?)?$/;
const HELP =
  /^(?:ayuda|help|menu|hola|holi|buenas|buenos dias|buenas tardes|buenas noches|comandos|hi|hello|hey|good morning|good afternoon|good evening|commands)$/;
const LINK = /^(vincular|link)\s+(\d{6})$/;

export function parseCommand(text: string): BotCommand | null {
  const normalized = strip(text);
  const link = normalized.match(LINK);
  if (link) return { kind: "link", code: link[2], locale: link[1] === "link" ? "en" : "es" };
  if (BALANCE.test(normalized) || ASK_CURRENT.test(normalized)) return { kind: "command", command: "balance" };
  const period = balancePeriod(normalized);
  if (period) return { kind: "command", command: "balance", period };
  const report = reportAsk(normalized);
  if (report) return { kind: "command", command: "report", ...report };
  if (UNDO.test(normalized)) return { kind: "command", command: "undo" };
  if (HELP.test(normalized)) return { kind: "command", command: "help" };
  return null;
}
