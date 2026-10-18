// Comandos fijos del bot. Se resuelven con expresiones regulares, sin llamar a la IA:
// son más rápidos, gratis y 100 % predecibles.
import { compareMonths, FIRST_MONTH, type Month, shiftMonth } from "@/lib/dates";

/** El mes que pide "balance septiembre" (con o sin año) o "balance mes pasado". */
export type BalancePeriod = { month: number; year?: number } | "previous";

export type BotCommand =
  | { kind: "command"; command: "balance"; period?: BalancePeriod }
  | { kind: "command"; command: "undo" | "help" }
  | { kind: "link"; code: string };

const strip = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.]+/g, "")
    .trim();

const BALANCE = /^(mi )?(balance|saldo|resumen)( del mes)?$|^cuanto (llevo|tengo|he gastado)( este mes)?$/;

// Los meses como se escriben (sin tildes: `strip` ya las quitó), con sus abreviaturas.
const MONTHS: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sept: 9, sep: 9, set: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};
const MONTH_WORD = "([a-z]+)";
const YEAR = "(?: (?:de |del )?(\\d{4}))?";
// "balance septiembre", "saldo de agosto", "resumen del mes de marzo", "balance sept 2025".
const BALANCE_MONTH = new RegExp(`^(?:mi )?(?:balance|saldo|resumen)(?: del mes de| de| del)? ${MONTH_WORD}${YEAR}$`);
// "cuánto gasté en septiembre", "cuánto llevo en agosto de 2025".
const SPENT_IN_MONTH = new RegExp(`^cuanto (?:llevo|tengo|he gastado|gaste)(?: gastado)? en(?: el mes de)? ${MONTH_WORD}${YEAR}$`);
// "balance mes pasado", "saldo del mes anterior", "cuánto gasté el mes pasado".
const PREVIOUS_MONTH =
  /^(?:mi )?(?:balance|saldo|resumen)(?: del?)? mes (?:pasado|anterior)$|^cuanto (?:llevo|tengo|he gastado|gaste)(?: gastado)? (?:el|en el) mes (?:pasado|anterior)$/;

/** El número del mes que se escribió ("sept" → 9); null si no es un mes. */
function monthNumber(word: string): number | null {
  return Object.hasOwn(MONTHS, word) ? MONTHS[word] : null;
}

/** "balance septiembre 2025" → { month: 9, year: 2025 }; null si no pide un mes. */
function balancePeriod(text: string): BalancePeriod | null {
  if (PREVIOUS_MONTH.test(text)) return "previous";
  const match = BALANCE_MONTH.exec(text) ?? SPENT_IN_MONTH.exec(text);
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
const UNDO = /^(deshacer|anular|borrar|eliminar)( (el )?ultimo)?$/;
const HELP = /^(ayuda|help|menu|hola|holi|buenas|buenos dias|buenas tardes|buenas noches|comandos)$/;
const LINK = /^vincular\s+(\d{6})$/;

export function parseCommand(text: string): BotCommand | null {
  const normalized = strip(text);
  const link = normalized.match(LINK);
  if (link) return { kind: "link", code: link[1] };
  if (BALANCE.test(normalized)) return { kind: "command", command: "balance" };
  const period = balancePeriod(normalized);
  if (period) return { kind: "command", command: "balance", period };
  if (UNDO.test(normalized)) return { kind: "command", command: "undo" };
  if (HELP.test(normalized)) return { kind: "command", command: "help" };
  return null;
}
