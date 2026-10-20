import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { category, transaction } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { searchKey } from "@/lib/suggestions";
import type { ToastTone } from "@/lib/toasts";
import { isCategoryAvailable } from "@/modules/transactions/queries";
import { newTransactionSchema } from "@/modules/transactions/validation";

// "Registrar pago" en los avisos de próximos pagos del Resumen: registra el pago de un gasto fijo como un
// egreso más, con la descripción y la categoría del último pago (las busca el servidor, nunca las da el
// navegador) y el monto y la fecha que confirma la persona. Reciben el userId ya validado por el Data
// Access Layer (src/lib/session.ts) y siempre filtran por él.

/** Cuántos egresos recientes se miran para encontrar el último pago de cada gasto. */
const RECENT_EXPENSES = 1000;

export type LastPayment = {
  description: string;
  categoryId: string | null;
  /** "🩺 Salud" o, sin categoría, "Sin categoría": para la ventana. */
  category: string;
};

/** El último pago de cada gasto (por su clave, `searchKey` de la descripción), entre los egresos recientes. */
export async function getLastPayments(userId: string): Promise<Map<string, LastPayment>> {
  const rows = await db
    .select({
      description: transaction.description,
      categoryId: transaction.categoryId,
      name: category.name,
      emoji: category.emoji,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(eq(transaction.userId, userId), eq(transaction.type, "expense"), isNull(transaction.deletedAt)))
    .orderBy(desc(transaction.occurredOn), desc(transaction.createdAt))
    .limit(RECENT_EXPENSES);
  const last = new Map<string, LastPayment>();
  for (const row of rows) {
    const key = searchKey(row.description);
    if (last.has(key)) continue;
    last.set(key, {
      description: row.description,
      categoryId: row.categoryId,
      category: row.name ? `${row.emoji} ${row.name}` : "Sin categoría",
    });
  }
  return last;
}

export type RegisterPaymentResult =
  | { ok: true; message: string; tone: ToastTone }
  | { ok: false; error: string; field?: "amount" | "occurredOn" };

/**
 * Registra el pago de un gasto fijo (`description`, como lo muestra el aviso) con el monto y la fecha que
 * confirmó la persona. `today` (YYYY-MM-DD, en su zona): la fecha no puede ser después. Si la categoría del
 * último pago ya no se puede elegir (el admin la archivó), va sin categoría.
 */
export async function registerFixedPayment(
  user: { id: string; currency: string },
  raw: { description: unknown; amount: unknown; occurredOn: unknown },
  today: string,
): Promise<RegisterPaymentResult> {
  const last = typeof raw.description === "string" ? (await getLastPayments(user.id)).get(searchKey(raw.description)) : undefined;
  if (!last) return { ok: false, error: "No encontramos ese gasto entre tus egresos." };
  const parsed = newTransactionSchema.safeParse({
    type: "expense",
    amount: String(raw.amount ?? ""),
    description: last.description,
    categoryId: "",
    occurredOn: String(raw.occurredOn ?? ""),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: issue.path[0] === "amount" ? "amount" : "occurredOn" };
  }
  const { amount, occurredOn } = parsed.data;
  if (occurredOn > today) return { ok: false, error: "La fecha no puede ser después de hoy.", field: "occurredOn" };
  const categoryId = last.categoryId && (await isCategoryAvailable(user.id, last.categoryId, "expense")) ? last.categoryId : null;
  await db.insert(transaction).values({
    userId: user.id,
    type: "expense",
    amount,
    currency: user.currency,
    description: last.description,
    categoryId,
    occurredOn,
    source: "web",
  });
  return { ok: true, message: `Se registró el pago de «${last.description}»: −${formatMoney(amount, user.currency)}`, tone: "success" };
}
