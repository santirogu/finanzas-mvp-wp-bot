// Validación de lo que devuelve la IA antes de tocar la base de datos.
// La IA propone; este código decide qué es aceptable.

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

const MAX_AMOUNT = 100_000_000_000; // 100 mil millones: por encima, casi seguro es un error de lectura.
const MAX_DESCRIPTION = 140;
const MAX_DAYS_BACK = 366;

const fold = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function matchCategory(proposed: string, available: readonly string[]): string | null {
  const wanted = fold(proposed);
  const exact = available.find((name) => fold(name) === wanted);
  if (exact) return exact;
  return available.find((name) => fold(name) === "otros") ?? null;
}

/** true si "YYYY-MM-DD" es un día que existe (Date.parse acepta "2026-02-30" y lo corre a marzo). */
function isCalendarDate(iso: string): boolean {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function normalizeDate(proposed: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proposed) || !isCalendarDate(proposed)) return today;
  const time = Date.parse(`${proposed}T00:00:00Z`);
  // Nunca fechas futuras ni absurdamente viejas.
  if (proposed > today) return today;
  const daysBack = (Date.parse(`${today}T00:00:00Z`) - time) / 86_400_000;
  return daysBack > MAX_DAYS_BACK ? today : proposed;
}

function normalizeDescription(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION);
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}

export function normalizeTransactions(
  raw: readonly RawTransaction[],
  ctx: { today: string; categories: CategoryNames },
): ParsedTransaction[] {
  const result: ParsedTransaction[] = [];
  for (const item of raw) {
    if (item.type !== "income" && item.type !== "expense") continue;
    const amount = Math.round(item.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) continue;
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
