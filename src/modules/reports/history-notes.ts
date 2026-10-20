import "server-only";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fixedExpenseNote, transaction } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { monthRange, parseMonthParam } from "@/lib/dates";
import { searchKey } from "@/lib/suggestions";
import type { ToastTone } from "@/lib/toasts";
import { type HistoryMonth, NOTE_MAX_LENGTH } from "./history";

// El historial de los gastos fijos (Reportes): los totales de cada mes en todo el tiempo y las notas que
// escribe la persona en cada cambio (la tabla fixed_expense_note). Reciben el userId ya validado por el
// Data Access Layer (src/lib/session.ts) y siempre filtran por él.

const TEXTS = texts(
  {
    tooLong: `Máximo ${NOTE_MAX_LENGTH} caracteres.`,
    error: "No se pudo guardar la nota.",
    deleted: "Se borró la nota",
    saved: "Se guardó la nota",
  },
  {
    en: {
      tooLong: `At most ${NOTE_MAX_LENGTH} characters.`,
      error: "The note couldn't be saved.",
      deleted: "The note was deleted",
      saved: "The note was saved",
    },
  },
);

const monthOfTransaction = sql<string>`to_char(${transaction.occurredOn}, 'YYYY-MM')`;

/**
 * Los egresos de cada mes por descripción, en todo el tiempo (sin importar mayúsculas ni espacios en los
 * extremos; las tildes se juntan en fixedHistories), con el primer pago de cada mes.
 */
export async function getExpenseHistoryMonths(userId: string): Promise<HistoryMonth[]> {
  const latest = sql`${transaction.occurredOn} desc, ${transaction.createdAt} desc`;
  const rows = await db
    .select({
      month: monthOfTransaction,
      description: sql<string>`(array_agg(trim(${transaction.description}) order by ${latest}))[1]`,
      total: sql<string>`sum(${transaction.amount})`,
      first: sql<string>`min(${transaction.occurredOn})::text`,
    })
    .from(transaction)
    .where(and(eq(transaction.userId, userId), eq(transaction.type, "expense"), isNull(transaction.deletedAt)))
    .groupBy(monthOfTransaction, sql`lower(trim(${transaction.description}))`);
  return rows.map((row) => ({ ...row, total: Number(row.total) }));
}

/** La clave de una nota: el gasto y el mes del cambio. */
export const noteKey = (key: string, month: string) => `${key}|${month}`;

/** Las notas de la persona, por `noteKey`. */
export async function getFixedNotes(userId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ key: fixedExpenseNote.descriptionKey, month: fixedExpenseNote.month, note: fixedExpenseNote.note })
    .from(fixedExpenseNote)
    .where(eq(fixedExpenseNote.userId, userId));
  return new Map(rows.map((row) => [noteKey(row.key, row.month), row.note]));
}

const input = z.object({
  description: z.string().trim().min(1).max(140),
  month: z.string().refine((value) => parseMonthParam(value) !== null),
  // Vacía, se borra.
  note: z.string().trim().max(NOTE_MAX_LENGTH),
});

export type FixedNoteResult = { ok: true; message: string; tone: ToastTone } | { ok: false; error: string; field?: "note" };

/** ¿La persona tiene un egreso (no eliminado) de ese gasto en ese mes? (Sin importar mayúsculas, tildes ni espacios.) */
async function hasExpenseIn(userId: string, key: string, month: string) {
  const { year, month: m } = parseMonthParam(month)!;
  const range = monthRange(year, m);
  const rows = await db
    .selectDistinct({ description: transaction.description })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "expense"),
        isNull(transaction.deletedAt),
        gte(transaction.occurredOn, range.start),
        lt(transaction.occurredOn, range.end),
      ),
    );
  return rows.some((row) => searchKey(row.description) === key);
}

/**
 * Guarda (o, vacía, borra) la nota de un cambio del historial: un gasto en un mes en que la persona lo
 * pagó. Así una nota siempre acompaña a algo que registró.
 */
export async function saveFixedNote(
  userId: string,
  raw: { description: unknown; month: unknown; note: unknown },
  locale: Locale = DEFAULT_LOCALE,
): Promise<FixedNoteResult> {
  const t = TEXTS[locale];
  const parsed = input.safeParse(raw);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.path[0] === "note" && issue.code === "too_big");
    return tooLong ? { ok: false, field: "note", error: t.tooLong } : { ok: false, error: t.error };
  }
  const { description, month, note } = parsed.data;
  const key = searchKey(description);
  if (!(await hasExpenseIn(userId, key, month))) return { ok: false, error: t.error };

  if (!note) {
    await db
      .delete(fixedExpenseNote)
      .where(and(eq(fixedExpenseNote.userId, userId), eq(fixedExpenseNote.descriptionKey, key), eq(fixedExpenseNote.month, month)));
    return { ok: true, message: t.deleted, tone: "removal" };
  }
  await db
    .insert(fixedExpenseNote)
    .values({ userId, descriptionKey: key, month, note })
    .onConflictDoUpdate({
      target: [fixedExpenseNote.userId, fixedExpenseNote.descriptionKey, fixedExpenseNote.month],
      set: { note, updatedAt: new Date() },
    });
  return { ok: true, message: t.saved, tone: "success" };
}
