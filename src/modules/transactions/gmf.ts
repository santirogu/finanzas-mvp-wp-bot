import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { category, transaction, user } from "@/db/schema";
import { isTaxCategory, TAX_CATEGORY, TAX_CATEGORY_EMOJI } from "./default-categories";
import { gmfAmount } from "./gmf-amount";

export { gmfAmount };

// El 4x1000 (el gravamen a los movimientos financieros, GMF): un egreso más, por el 0,4 % de otro, en la categoría
// del 4x1000 y con su misma fecha. Queda atado a su egreso (`transaction.tax_of`): se recalcula si el egreso cambia
// y se borra o se restaura con él. Lo ofrecen el formulario de egresos y el bot, si la persona lo tiene prendido en
// Configuración (`user.gmf_enabled`).

type Executor = Pick<typeof db, "select" | "insert" | "update">;

/** El largo máximo de una descripción (src/modules/transactions/validation.ts). */
const MAX_DESCRIPTION = 140;

/** La descripción del 4x1000 de un egreso: "4x1000 · Arriendo". */
export const gmfDescription = (description: string): string => `4x1000 · ${description}`.slice(0, MAX_DESCRIPTION);

/**
 * El id externo del 4x1000 de un egreso del bot: el mismo mensaje ("wamid…:0" → "wamid…:4x0"), así "deshacer" se
 * lleva el egreso y su 4x1000 juntos (src/modules/transactions/bot-mutations.ts).
 */
export function gmfExternalId(externalId: string | null): string | null {
  if (!externalId) return null;
  const cut = externalId.lastIndexOf(":");
  return `${externalId.slice(0, cut)}:4x${externalId.slice(cut + 1)}`;
}

/**
 * El id de la categoría del 4x1000. Si no existe (una base de antes), la crea; si el admin la había archivado, la
 * restaura: el 4x1000 siempre tiene adónde ir.
 */
export async function taxCategoryId(tx: Executor = db): Promise<string> {
  const find = async () =>
    (
      await tx
        .select({ id: category.id, name: category.name, archivedAt: category.archivedAt })
        .from(category)
        .where(and(isNull(category.userId), eq(category.type, "expense")))
    ).find((row) => isTaxCategory(row.name, "expense"));
  const found = await find();
  if (found) {
    if (found.archivedAt) await tx.update(category).set({ archivedAt: null }).where(eq(category.id, found.id));
    return found.id;
  }
  await tx.insert(category).values({ type: "expense", name: TAX_CATEGORY, emoji: TAX_CATEGORY_EMOJI }).onConflictDoNothing();
  // La de este pedido o la de otro que la creó al mismo tiempo.
  const created = await find();
  if (!created) throw new Error("No se pudo crear la categoría del 4x1000");
  return created.id;
}

export type GmfParent = {
  id: string;
  userId: string;
  amount: number;
  description: string;
  occurredOn: string;
  source: "web" | "whatsapp";
  externalId: string | null;
};

/**
 * Registra el 4x1000 de cada egreso (uno por egreso: si ya lo tenía, no lo repite) y devuelve los que creó. Un
 * egreso de menos de $2,50 no tiene 4x1000 (no llega a un centavo).
 */
export async function addGmf(parents: GmfParent[], tx: Executor = db) {
  const rows = parents.filter((parent) => gmfAmount(parent.amount) > 0);
  if (rows.length === 0) return [];
  const categoryId = await taxCategoryId(tx);
  return tx
    .insert(transaction)
    .values(
      rows.map((parent) => ({
        userId: parent.userId,
        type: "expense" as const,
        amount: gmfAmount(parent.amount),
        description: gmfDescription(parent.description),
        categoryId,
        occurredOn: parent.occurredOn,
        source: parent.source,
        externalId: gmfExternalId(parent.externalId),
        taxOf: parent.id,
      })),
    )
    .onConflictDoNothing()
    .returning({
      description: transaction.description,
      amount: transaction.amount,
      occurredOn: transaction.occurredOn,
      categoryId: transaction.categoryId,
    });
}

/** Si el egreso tiene 4x1000, lo recalcula con lo que quedó: su monto, su descripción y su fecha. */
export async function syncGmf(parent: Pick<GmfParent, "id" | "userId" | "amount" | "description" | "occurredOn">, tx: Executor = db) {
  const amount = gmfAmount(parent.amount);
  if (amount <= 0) return;
  await tx
    .update(transaction)
    .set({ amount, description: gmfDescription(parent.description), occurredOn: parent.occurredOn })
    .where(and(eq(transaction.taxOf, parent.id), eq(transaction.userId, parent.userId)));
}

/** ¿Le cobran el 4x1000? (Configuración; prendido por defecto). */
export async function getGmfEnabled(userId: string): Promise<boolean> {
  const [row] = await db.select({ enabled: user.gmfEnabled }).from(user).where(eq(user.id, userId));
  return row?.enabled ?? true;
}

/** Lo prende o lo apaga (Configuración → 4x1000). */
export async function saveGmfEnabled(userId: string, enabled: boolean): Promise<void> {
  await db.update(user).set({ gmfEnabled: enabled }).where(eq(user.id, userId));
}
