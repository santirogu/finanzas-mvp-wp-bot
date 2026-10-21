import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fixedExpenseChoice, transaction } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import type { ToastTone } from "@/lib/toasts";
import { searchKey } from "@/lib/suggestions";
import type { FixedChoices } from "./recurring";

// Los gastos fijos marcados a mano en Reportes (la tabla fixed_expense_choice). Reciben el userId ya
// validado por el Data Access Layer (src/lib/session.ts) y siempre filtran por él.

/** Lo que marcó la persona: las claves (`searchKey` de la descripción) que agregó y las que quitó. */
export async function getFixedChoices(userId: string): Promise<FixedChoices> {
  const rows = await db
    .select({ key: fixedExpenseChoice.descriptionKey, choice: fixedExpenseChoice.choice })
    .from(fixedExpenseChoice)
    .where(eq(fixedExpenseChoice.userId, userId));
  return {
    include: new Set(rows.filter((row) => row.choice === "include").map((row) => row.key)),
    exclude: new Set(rows.filter((row) => row.choice === "exclude").map((row) => row.key)),
  };
}

/**
 * Qué se hace con un gasto:
 * - `include`: agregarlo a mano (uno que el detector todavía no ve);
 * - `exclude`: quitar uno detectado (pasa a "Quitados");
 * - `restore`: volver a poner uno quitado;
 * - `unadd`: sacar uno que se había agregado a mano.
 */
export const FIXED_ACTIONS = ["include", "exclude", "restore", "unadd"] as const;

const input = z.object({
  description: z.string().trim().min(1).max(140),
  action: z.enum(FIXED_ACTIONS),
});

export type FixedChoiceResult = { ok: true; message: string; tone: ToastTone } | { ok: false; error: string };

/** El color del aviso de cada acción: verde si el gasto queda entre los fijos, rojo si sale. */
const TONES: Record<(typeof FIXED_ACTIONS)[number], ToastTone> = { include: "success", exclude: "removal", restore: "success", unadd: "removal" };

const TEXTS = texts(
  {
    done: {
      include: (name: string) => `Se agregó “${name}” a los gastos fijos`,
      exclude: (name: string) => `Se quitó “${name}” de los gastos fijos`,
      restore: (name: string) => `Volvió “${name}” a los gastos fijos`,
      unadd: (name: string) => `Se quitó “${name}” de los gastos fijos`,
    },
    pick: "Elige un egreso.",
    notYours: "Ese egreso no está entre tus movimientos.",
  },
  {
    en: {
      done: {
        include: (name) => `“${name}” was added to your bills`,
        exclude: (name) => `“${name}” was removed from your bills`,
        restore: (name) => `“${name}” is back in your bills`,
        unadd: (name) => `“${name}” was removed from your bills`,
      },
      pick: "Choose an expense.",
      notYours: "That expense isn't among your transactions.",
    },
  },
);

/** ¿La persona tiene algún egreso (no eliminado) con esa descripción? */
async function hasExpense(userId: string, description: string) {
  const [row] = await db
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "expense"),
        isNull(transaction.deletedAt),
        sql`lower(trim(${transaction.description})) = lower(${description})`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Marca o desmarca un gasto fijo de la persona. Solo se marca uno que esté entre sus egresos. */
export async function chooseFixedExpense(
  userId: string,
  raw: { description: unknown; action: unknown },
  locale: Locale = DEFAULT_LOCALE,
): Promise<FixedChoiceResult> {
  const t = TEXTS[locale];
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: t.pick };
  const { description, action } = parsed.data;
  const key = searchKey(description);

  if (action === "include" || action === "exclude") {
    // Solo se marca lo que está entre sus egresos: así no se guardan textos inventados (las marcas no
    // crecen sin límite) y lo marcado siempre es algo que la persona registró.
    if (!(await hasExpense(userId, description))) {
      return { ok: false, error: t.notYours };
    }
    await db
      .insert(fixedExpenseChoice)
      .values({ userId, descriptionKey: key, choice: action })
      .onConflictDoUpdate({
        target: [fixedExpenseChoice.userId, fixedExpenseChoice.descriptionKey],
        set: { choice: action, createdAt: new Date() },
      });
  } else {
    // Deshacer una marca: volver a lo que decida el detector.
    await db
      .delete(fixedExpenseChoice)
      .where(
        and(
          eq(fixedExpenseChoice.userId, userId),
          eq(fixedExpenseChoice.descriptionKey, key),
          eq(fixedExpenseChoice.choice, action === "restore" ? "exclude" : "include"),
        ),
      );
  }
  return { ok: true, message: t.done[action](description), tone: TONES[action] };
}
