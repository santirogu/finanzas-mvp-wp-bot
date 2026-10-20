// Validación de lo que devuelve la IA antes de tocar la base de datos.
// La IA propone; este código decide qué es aceptable.
import { MAX_AMOUNT, roundToCents } from "@/lib/money";
import { withoutControlChars } from "@/lib/text";
import { MAX_REPLY_LENGTH } from "./limits";

export type TransactionKind = "income" | "expense";

export type RawTransaction = {
  type: TransactionKind;
  amount: number;
  description: string;
  category: string;
  date: string;
};

export type ParsedTransaction = {
  type: TransactionKind;
  amount: number;
  description: string;
  /** Nombre exacto de una categoría existente, o null si no hay ninguna aplicable. */
  category: string | null;
  /** YYYY-MM-DD */
  occurredOn: string;
};

export type CategoryNames = Record<TransactionKind, readonly string[]>;

const MAX_DESCRIPTION = 140;
const MAX_DAYS_BACK = 366;

const fold = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function matchCategory(proposed: string, available: readonly string[]): string | null {
  const wanted = fold(proposed);
  const exact = available.find((name) => fold(name) === wanted);
  if (exact) return exact;
  return available.find((name) => fold(name) === "otros") ?? null;
}

/**
 * true si "YYYY-MM-DD" es un día que existe (Date.parse acepta "2026-02-30" y lo corre a marzo): armada
 * la fecha, vuelve a dar el mismo texto. "2026-02-30" da "2026-03-02", y "0099-05-05" da "1999-05-05".
 */
function isCalendarDate(iso: string): boolean {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === iso;
}

function normalizeDate(proposed: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proposed) || !isCalendarDate(proposed)) return today;
  const time = Date.parse(`${proposed}T00:00:00Z`);
  // Nunca fechas futuras ni absurdamente viejas.
  // Stryker disable next-line EqualityOperator: si la fecha es la de hoy, devuelve hoy en los dos casos
  if (proposed > today) return today;
  const daysBack = (Date.parse(`${today}T00:00:00Z`) - time) / 86_400_000;
  return daysBack > MAX_DAYS_BACK ? today : proposed;
}

function normalizeDescription(text: string): string {
  const clean = withoutControlChars(text.replace(/\s+/g, " ")).trim().slice(0, MAX_DESCRIPTION);
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}

export function normalizeTransactions(
  raw: readonly RawTransaction[],
  ctx: { today: string; categories: CategoryNames },
): ParsedTransaction[] {
  const result: ParsedTransaction[] = [];
  for (const item of raw) {
    if (item.type !== "income" && item.type !== "expense") continue;
    // Pesos con centavos; por encima de MAX_AMOUNT, casi seguro es un error de lectura.
    const amount = roundToCents(item.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) continue;
    const description = normalizeDescription(item.description);
    result.push({
      type: item.type,
      amount,
      description: description || (item.type === "income" ? "Ingreso" : "Gasto"),
      category: matchCategory(item.category, ctx.categories[item.type]),
      occurredOn: normalizeDate(item.date, ctx.today),
    });
  }
  return result;
}

// Un enlace en la respuesta del modelo: con http(s)://, www. o un dominio con terminación conocida
// (WhatsApp los vuelve clicables aunque no tengan http).
const LINK = /https?:\/\/|www\.|[\w-]\.(com|co|net|org|info|io|app|me|ly|link|xyz|site|online|store|shop|ai|gg|to)\b/i;

/**
 * La respuesta libre del modelo (cuando no hay movimientos), lista para enviar: en una sola línea, de
 * máximo MAX_REPLY_LENGTH caracteres y sin enlaces. Con un texto pegado de otro lado, el modelo podría
 * responder con la voz del servicio algo engañoso ("verifica tu cuenta en…"). null si no sirve: se
 * usa una respuesta fija.
 */
export function normalizeReply(text: string | null | undefined): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  let reply = clean;
  if (clean.length > MAX_REPLY_LENGTH) {
    const cut = clean.slice(0, MAX_REPLY_LENGTH - 1);
    const lastSpace = cut.lastIndexOf(" ");
    // Stryker disable next-line EqualityOperator: el texto viene sin espacios al inicio (trim), así que lastSpace nunca es 0
    reply = `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
  }
  // Se busca en el texto ya recortado: la expresión nunca recorre más de MAX_REPLY_LENGTH caracteres.
  return LINK.test(reply) ? null : reply;
}
