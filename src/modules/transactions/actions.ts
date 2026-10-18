"use server";

import { and, eq, gte, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { transaction } from "@/db/schema";
import { currentMonthRange, monthOf } from "@/lib/dates";
import { monthHref } from "@/lib/month-nav";
import { TOAST_PARAM } from "@/lib/toasts";
import { requireUser } from "@/lib/session";
import { isCategoryAvailable, undoableSince } from "./queries";
import { newTransactionSchema } from "./validation";

export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"amount" | "description" | "categoryId" | "occurredOn", string>>;
  // React reinicia el formulario tras cada envío; devolvemos lo escrito para no perderlo si hay error.
  values?: Record<string, string>;
  /** La fecha del movimiento registrado: si cae en otro mes que el de la lista, el aviso dice en cuál. */
  occurredOn?: string;
};

export async function createTransactionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Cada Server Action re-valida la sesión: nunca se confía en el cliente.
  const user = await requireUser();

  const { values, input, fieldErrors } = readForm(formData);
  if (!input) return { ok: false, fieldErrors, values };
  if (input.categoryId && !(await isCategoryAvailable(user.id, input.categoryId, input.type))) {
    return { ok: false, fieldErrors: { categoryId: "Categoría inválida" }, values };
  }

  await db.insert(transaction).values({
    userId: user.id,
    type: input.type,
    amount: input.amount,
    currency: user.currency,
    description: input.description,
    categoryId: input.categoryId ?? null,
    occurredOn: input.occurredOn,
    source: "web",
  });

  refresh();
  return {
    ok: true,
    message: input.type === "income" ? "Ingreso registrado" : "Egreso registrado",
    occurredOn: input.occurredOn,
  };
}

/** Lee y valida los campos comunes del formulario de movimientos. */
function readForm(formData: FormData) {
  const values = {
    type: String(formData.get("type") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    occurredOn: String(formData.get("occurredOn") ?? ""),
  };
  const parsed = newTransactionSchema.safeParse(values);
  if (parsed.success) return { values, input: parsed.data };

  const fieldErrors: FormState["fieldErrors"] = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof NonNullable<FormState["fieldErrors"]>;
    fieldErrors[key] ??= issue.message;
  }
  return { values, fieldErrors };
}

export async function updateTransactionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Cada Server Action re-valida la sesión: nunca se confía en el cliente.
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "No encontramos ese movimiento" };

  const { values, input, fieldErrors } = readForm(formData);
  if (!input) return { ok: false, fieldErrors, values };
  // Puede conservar la categoría que ya tenía aunque el admin la haya archivado.
  if (input.categoryId && !(await isCategoryAvailable(user.id, input.categoryId, input.type, { keepFrom: id.data }))) {
    return { ok: false, fieldErrors: { categoryId: "Categoría inválida" }, values };
  }

  // Solo movimientos propios y no eliminados, y sin cambiar su tipo: un egreso sigue siendo
  // egreso aunque el formulario diga otra cosa. El origen (web o WhatsApp) tampoco cambia.
  const updated = await db
    .update(transaction)
    .set({
      amount: input.amount,
      description: input.description,
      categoryId: input.categoryId ?? null,
      occurredOn: input.occurredOn,
    })
    .where(
      and(
        eq(transaction.id, id.data),
        eq(transaction.userId, user.id),
        eq(transaction.type, input.type),
        isNull(transaction.deletedAt),
      ),
    )
    .returning({ id: transaction.id });
  if (updated.length === 0) return { ok: false, message: "No encontramos ese movimiento", values };

  // La lista muestra el aviso "Cambios guardados" (?aviso=, src/lib/toasts.ts).
  redirect(listOf(input.type, input.occurredOn, user.timezone, { [TOAST_PARAM]: "guardado" }));
}

/**
 * La lista adonde vuelve un movimiento después de editarlo, borrarlo o restaurarlo: la de su tipo, en
 * el mes de su fecha (`?mes=`, si no es el actual), con el aviso que pida `extra`.
 */
const listOf = (type: "income" | "expense", occurredOn: string, timezone: string, extra?: Record<string, string>) =>
  monthHref(type === "income" ? "/ingresos" : "/egresos", monthOf(occurredOn), currentMonthRange(timezone), extra);

export async function deleteTransactionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  // Borrado lógico, filtrado por dueño: un usuario no puede tocar movimientos ajenos.
  const [deleted] = await db
    .update(transaction)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(transaction.id, id.data), eq(transaction.userId, user.id), isNull(transaction.deletedAt)),
    )
    .returning({ type: transaction.type, occurredOn: transaction.occurredOn });
  if (!deleted) {
    refresh();
    return;
  }

  // La lista muestra el aviso "Se borró… · Deshacer" (TransactionsView lee el id de la URL).
  redirect(listOf(deleted.type, deleted.occurredOn, user.timezone, { borrado: id.data }));
}

/**
 * Deshace el borrado de un movimiento propio, solo si fue hace menos de UNDO_WINDOW_MS: el aviso de
 * la lista no ofrece más que eso, y un movimiento borrado hace días no vuelve por un enlace viejo.
 */
export async function restoreTransactionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  const [restored] = await db
    .update(transaction)
    .set({ deletedAt: null })
    .where(
      and(
        eq(transaction.id, id.data),
        eq(transaction.userId, user.id),
        gte(transaction.deletedAt, undoableSince(new Date())),
      ),
    )
    .returning({ type: transaction.type, occurredOn: transaction.occurredOn });
  if (!restored) {
    refresh();
    return;
  }

  redirect(listOf(restored.type, restored.occurredOn, user.timezone, { restaurado: id.data }));
}
