"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { transaction } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { isCategoryAvailable } from "./queries";
import { newTransactionSchema } from "./validation";

export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"amount" | "description" | "categoryId" | "occurredOn", string>>;
  // React reinicia el formulario tras cada envío; devolvemos lo escrito para no perderlo si hay error.
  values?: Record<string, string>;
};

export async function createTransactionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Cada Server Action re-valida la sesión: nunca se confía en el cliente.
  const user = await requireUser();

  const values = {
    type: String(formData.get("type") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    occurredOn: String(formData.get("occurredOn") ?? ""),
  };
  const parsed = newTransactionSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: FormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<FormState["fieldErrors"]>;
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, fieldErrors, values };
  }

  const input = parsed.data;
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
  return { ok: true, message: input.type === "income" ? "Ingreso registrado" : "Egreso registrado" };
}

export async function deleteTransactionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  // Borrado lógico, filtrado por dueño: un usuario no puede tocar movimientos ajenos.
  await db
    .update(transaction)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(transaction.id, id.data), eq(transaction.userId, user.id), isNull(transaction.deletedAt)),
    );

  refresh();
}
