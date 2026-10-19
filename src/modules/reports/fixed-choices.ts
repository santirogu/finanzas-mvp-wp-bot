import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { fixedExpenseChoice, transaction } from "@/db/schema";
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

/** El aviso de cada acción: verde si el gasto queda entre los fijos, rojo si sale. */
const DONE: Record<(typeof FIXED_ACTIONS)[number], { tone: ToastTone; text: (name: string) => string }> = {
  include: { tone: "success", text: (name) => `Se agregó «${name}» a los gastos fijos` },
  exclude: { tone: "removal", text: (name) => `Se quitó «${name}» de los gastos fijos` },
  restore: { tone: "success", text: (name) => `Volvió «${name}» a los gastos fijos` },
  unadd: { tone: "removal", text: (name) => `Se quitó «${name}» de los gastos fijos` },
};

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

/** Marca o desmarca un gasto fijo de la persona. Solo se agrega uno que esté entre sus egresos. */
export async function chooseFixedExpense(userId: string, raw: { description: unknown; action: unknown }): Promise<FixedChoiceResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Elige un egreso." };
  const { description, action } = parsed.data;
  const key = searchKey(description);

  if (action === "include" || action === "exclude") {
    if (action === "include" && !(await hasExpense(userId, description))) {
      return { ok: false, error: "Ese egreso no está entre tus movimientos." };
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
  return { ok: true, message: DONE[action].text(description), tone: DONE[action].tone };
}
