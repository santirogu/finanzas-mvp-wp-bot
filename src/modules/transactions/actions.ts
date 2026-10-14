"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
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
  return { ok: true, message: input.type === "income" ? "Ingreso registrado" : "Egreso registrado" };
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
  if (input.categoryId && !(await isCategoryAvailable(user.id, input.categoryId, input.type))) {
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

  redirect(input.type === "income" ? "/ingresos" : "/egresos");
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
