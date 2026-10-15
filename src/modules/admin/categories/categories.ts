import "server-only";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db";
import { category, categoryChange, transaction, user, type CategoryChangeDetails } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { confirmAdminCode } from "../shared/confirm-code";
import {
  CATEGORY_TYPES,
  CATEGORY_TYPE_LABELS,
  DEFAULT_CATEGORY,
  foldName,
  isDefaultCategory,
  parseCategoryName,
  parseEmoji,
  sortCategories,
  type CategoryChangeEntry,
  type CategoryType,
} from "./category-input";

// Categorías (/admin/categorias): las globales (user_id NULL), que usan los formularios y el bot de
// todas las cuentas. Cada función valida el rol (requireAdmin) antes de tocar la base, como toda la
// capa de datos de administración. Archivar y eliminar piden además el código de Google
// Authenticator; cada cambio queda en category_change con el admin.

export type AdminCategory = {
  id: string;
  type: CategoryType;
  name: string;
  emoji: string;
  archived: boolean;
  /** En cuántos movimientos (no eliminados) se usa, sumando todas las cuentas. */
  movements: number;
  /** "Otros": la que usa el bot si ninguna encaja; solo se le cambia el emoji. */
  isDefault: boolean;
};

export type CategoryChange = CategoryChangeEntry & { id: string; createdAt: Date };

export type CategoryResult = { ok: true; message: string } | { ok: false; error: string; field?: "name" | "emoji" | "code" };

const CHANGES_SHOWN = 20;

// La cuenta del admin que hizo cada cambio.
const adminUser = alias(user, "admin_user");
// Los movimientos vigentes de cada categoría (con una unión y no una subconsulta: con una sola tabla,
// Drizzle escribe las columnas sin su tabla y la subconsulta las confundiría).
const usage = sql<number>`count(${transaction.id}) filter (where ${transaction.deletedAt} is null)`.mapWith(Number);
const fail = (error: string, field?: "name" | "emoji" | "code"): CategoryResult => ({ ok: false, error, ...(field && { field }) });
const label = (c: { emoji: string; name: string }) => `${c.emoji} ${c.name}`;

/** Una categoría global por su id, o null (también con un id inválido). */
async function loadCategory(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({ id: category.id, type: category.type, name: category.name, emoji: category.emoji, archivedAt: category.archivedAt })
    .from(category)
    .where(and(eq(category.id, id), isNull(category.userId)));
  return row ?? null;
}

/** ¿Ya hay otra categoría global de ese tipo con ese nombre (sin importar mayúsculas ni tildes; también archivadas)? */
async function nameTaken(type: CategoryType, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(and(eq(category.type, type), isNull(category.userId)));
  return rows.some((row) => row.id !== exceptId && foldName(row.name) === foldName(name));
}

const takenMessage = (type: CategoryType) => `Ya hay una categoría de ${CATEGORY_TYPE_LABELS[type].toLowerCase()} con ese nombre.`;

/** Todas las categorías globales, de los dos tipos, en orden alfabético con "Otros" al final. */
export async function listAdminCategories(): Promise<AdminCategory[]> {
  await requireAdmin();
  const rows = await db
    .select({
      id: category.id,
      type: category.type,
      name: category.name,
      emoji: category.emoji,
      archivedAt: category.archivedAt,
      movements: usage,
    })
    .from(category)
    .leftJoin(transaction, eq(transaction.categoryId, category.id))
    .where(isNull(category.userId))
    .groupBy(category.id);
  return sortCategories(rows).map(({ archivedAt, ...row }) => ({
    ...row,
    archived: archivedAt !== null,
    isDefault: isDefaultCategory(row.name),
  }));
}

/** El resumen de la tarjeta de Inicio: cuántas categorías activas hay de cada tipo. */
export async function categoriesSummary(): Promise<Record<CategoryType, number>> {
  await requireAdmin();
  const rows = await db
    .select({ type: category.type, total: count() })
    .from(category)
    .where(and(isNull(category.userId), isNull(category.archivedAt)))
    .groupBy(category.type);
  return Object.fromEntries(CATEGORY_TYPES.map((type) => [type, rows.find((r) => r.type === type)?.total ?? 0])) as Record<
    CategoryType,
    number
  >;
}

/** Los últimos cambios, del más nuevo al más viejo. */
export async function listCategoryChanges(): Promise<CategoryChange[]> {
  await requireAdmin();
  const rows = await db
    .select({
      id: categoryChange.id,
      action: categoryChange.action,
      type: categoryChange.type,
      name: categoryChange.name,
      emoji: categoryChange.emoji,
      details: categoryChange.details,
      createdAt: categoryChange.createdAt,
      adminName: adminUser.name,
    })
    .from(categoryChange)
    .leftJoin(adminUser, eq(adminUser.id, categoryChange.adminId))
    .orderBy(desc(categoryChange.createdAt), desc(categoryChange.id))
    .limit(CHANGES_SHOWN);
  return rows.map(({ adminName, ...row }) => ({ ...row, admin: adminName !== null ? { name: adminName } : null }));
}

type Executor = Pick<typeof db, "insert">;
function logChange(
  tx: Executor,
  change: { adminId: string; categoryId: string | null; action: CategoryChange["action"]; type: CategoryType; name: string; emoji: string; details?: CategoryChangeDetails },
) {
  return tx.insert(categoryChange).values({ ...change, details: change.details ?? {} });
}

/** Crea una categoría global: aparece de inmediato en los formularios y el bot puede usarla. */
export async function createCategory(input: { type: string; name: string; emoji: string }): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const type: CategoryType = input.type === "income" ? "income" : "expense";
  const name = parseCategoryName(input.name);
  if (!name.ok) return fail(name.error, "name");
  const emoji = parseEmoji(input.emoji);
  if (!emoji.ok) return fail(emoji.error, "emoji");
  if (await nameTaken(type, name.value)) return fail(takenMessage(type), "name");

  const created = { type, name: name.value, emoji: emoji.value };
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(category).values(created).returning({ id: category.id });
    await logChange(tx, { adminId: admin.id, categoryId: row.id, action: "created", ...created });
  });
  return { ok: true, message: `Se creó la categoría ${label(created)}.` };
}

/** Cambia el nombre o el emoji. A "Otros" solo el emoji. Los movimientos que la usan pasan a verse con el nombre nuevo. */
export async function updateCategory(input: { id: string; name: string; emoji: string }): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const current = await loadCategory(input.id);
  if (!current) return fail("Esta categoría ya no existe.");
  const name = parseCategoryName(input.name);
  if (!name.ok) return fail(name.error, "name");
  const emoji = parseEmoji(input.emoji);
  if (!emoji.ok) return fail(emoji.error, "emoji");
  if (isDefaultCategory(current.name) && name.value !== current.name) {
    return fail(`A "${DEFAULT_CATEGORY}" solo se le puede cambiar el emoji.`, "name");
  }
  if (name.value === current.name && emoji.value === current.emoji) return { ok: true, message: "No había nada que cambiar." };
  if (await nameTaken(current.type, name.value, current.id)) return fail(takenMessage(current.type), "name");

  const updated = { name: name.value, emoji: emoji.value };
  await db.transaction(async (tx) => {
    await tx.update(category).set(updated).where(eq(category.id, current.id));
    await logChange(tx, {
      adminId: admin.id,
      categoryId: current.id,
      action: "updated",
      type: current.type,
      ...updated,
      details: { previousName: current.name, previousEmoji: current.emoji },
    });
  });
  return { ok: true, message: `Se guardó la categoría ${label(updated)}.` };
}

/** Archiva: deja de aparecer en los formularios y el bot no la usa, pero los movimientos la conservan. */
export async function archiveCategory(input: { id: string; code: string }, now = new Date()): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const current = await loadCategory(input.id);
  if (!current) return fail("Esta categoría ya no existe.");
  if (isDefaultCategory(current.name)) return fail(`"${DEFAULT_CATEGORY}" no se puede archivar: es la categoría por defecto.`);
  if (current.archivedAt) return fail("La categoría ya está archivada.");
  const check = await confirmAdminCode(input.code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx.update(category).set({ archivedAt: now }).where(eq(category.id, current.id));
    await logChange(tx, { adminId: admin.id, categoryId: current.id, action: "archived", type: current.type, name: current.name, emoji: current.emoji });
  });
  return { ok: true, message: `Se archivó la categoría ${label(current)}.` };
}

/** Restaura una archivada: vuelve a los formularios y al bot. No pide el código (solo deshace un archivado). */
export async function restoreCategory(input: { id: string }): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const current = await loadCategory(input.id);
  if (!current) return fail("Esta categoría ya no existe.");
  if (!current.archivedAt) return fail("La categoría no está archivada.");

  await db.transaction(async (tx) => {
    await tx.update(category).set({ archivedAt: null }).where(eq(category.id, current.id));
    await logChange(tx, { adminId: admin.id, categoryId: current.id, action: "restored", type: current.type, name: current.name, emoji: current.emoji });
  });
  return { ok: true, message: `Se restauró la categoría ${label(current)}.` };
}

/**
 * Elimina la categoría. Sus movimientos (de todas las cuentas, también los eliminados) pasan a
 * "Otros" de su mismo tipo, en la misma transacción. Queda en el registro de cambios.
 */
export async function deleteCategory(input: { id: string; code: string }, now = new Date()): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const current = await loadCategory(input.id);
  if (!current) return fail("Esta categoría ya no existe.");
  if (isDefaultCategory(current.name)) return fail(`"${DEFAULT_CATEGORY}" no se puede eliminar: es la categoría por defecto.`);
  const [fallback] = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(and(eq(category.type, current.type), isNull(category.userId)))
    .then((rows) => rows.filter((row) => isDefaultCategory(row.name)));
  if (!fallback) return fail(`Falta la categoría "${DEFAULT_CATEGORY}": créala antes de eliminar otra.`);
  const check = await confirmAdminCode(input.code, now);
  if (!check.ok) return fail(check.error, "code");

  const moved = await db.transaction(async (tx) => {
    const reassigned = await tx
      .update(transaction)
      .set({ categoryId: fallback.id })
      .where(eq(transaction.categoryId, current.id))
      .returning({ deletedAt: transaction.deletedAt });
    await tx.delete(category).where(eq(category.id, current.id));
    // Se cuentan los movimientos vigentes (los mismos que mostraba la lista).
    const active = reassigned.filter((row) => row.deletedAt === null).length;
    await logChange(tx, {
      adminId: admin.id,
      categoryId: null,
      action: "deleted",
      type: current.type,
      name: current.name,
      emoji: current.emoji,
      details: active ? { moved: active } : {},
    });
    return active;
  });
  return {
    ok: true,
    message: moved
      ? `Se eliminó la categoría ${label(current)}; ${moved} ${moved === 1 ? "movimiento pasó" : "movimientos pasaron"} a ${DEFAULT_CATEGORY}.`
      : `Se eliminó la categoría ${label(current)}.`,
  };
}
