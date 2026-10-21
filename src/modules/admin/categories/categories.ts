import "server-only";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db";
import { category, categoryChange, transaction, user, type CategoryChangeDetails } from "@/db/schema";
import { getRequestLocale } from "@/i18n/request";
import { texts } from "@/i18n/texts";
import { requireAdmin } from "@/lib/session";
import { confirmAdminCode } from "../shared/confirm-code";
import {
  CATEGORY_TYPES,
  DEFAULT_CATEGORY,
  foldName,
  isDefaultCategory,
  parseCategoryName,
  parseEmoji,
  parseEnglishName,
  sortCategories,
  type CategoryChangeEntry,
  type CategoryType,
} from "./category-input";

// Categorías (/admin/categorias): las globales (user_id NULL), que usan los formularios y el bot de
// todas las cuentas. Cada función valida el rol (requireAdmin) antes de tocar la base, como toda la
// capa de datos de administración. Archivar y eliminar piden además el código de Google
// Authenticator; cada cambio queda en category_change con el admin. Los mensajes van en el idioma de quien
// hace el pedido (la cookie); el nombre de las categorías, tal cual.

export type AdminCategory = {
  id: string;
  type: CategoryType;
  name: string;
  /** El nombre con la app en inglés (null: se ve `name`). */
  nameEn: string | null;
  emoji: string;
  archived: boolean;
  /** En cuántos movimientos (no eliminados) se usa, sumando todas las cuentas. */
  movements: number;
  /** "Otros": la que usa el bot si ninguna encaja; solo se le cambian el emoji y el nombre en inglés. */
  isDefault: boolean;
};

export type CategoryChange = CategoryChangeEntry & { id: string; createdAt: Date };

type Field = "name" | "nameEn" | "emoji" | "code";
export type CategoryResult = { ok: true; message: string } | { ok: false; error: string; field?: Field };

const CHANGES_SHOWN = 20;

// La cuenta del admin que hizo cada cambio.
const adminUser = alias(user, "admin_user");
// Los movimientos vigentes de cada categoría (con una unión y no una subconsulta: con una sola tabla,
// Drizzle escribe las columnas sin su tabla y la subconsulta las confundiría).
const usage = sql<number>`count(${transaction.id}) filter (where ${transaction.deletedAt} is null)`.mapWith(Number);
const fail = (error: string, field?: Field): CategoryResult => ({ ok: false, error, ...(field && { field }) });
const label = (c: { emoji: string; name: string }) => `${c.emoji} ${c.name}`;

const TEXTS = texts(
  {
    created: (label: string) => `Se creó la categoría ${label}.`,
    gone: "Esta categoría ya no existe.",
    defaultOnlyEmoji: `A “${DEFAULT_CATEGORY}” solo se le pueden cambiar el emoji y el nombre en inglés.`,
    nothing: "No había nada que cambiar.",
    saved: (label: string) => `Se guardó la categoría ${label}.`,
    cannotArchive: `“${DEFAULT_CATEGORY}” no se puede archivar: es la categoría por defecto.`,
    alreadyArchived: "La categoría ya está archivada.",
    archived: (label: string) => `Se archivó la categoría ${label}.`,
    notArchived: "La categoría no está archivada.",
    restored: (label: string) => `Se restauró la categoría ${label}.`,
    cannotDelete: `“${DEFAULT_CATEGORY}” no se puede eliminar: es la categoría por defecto.`,
    missingDefault: `Falta la categoría “${DEFAULT_CATEGORY}”: créala antes de eliminar otra.`,
    deleted: (label: string, moved: number) =>
      `Se eliminó la categoría ${label}${moved ? `; ${moved} ${moved === 1 ? "movimiento pasó" : "movimientos pasaron"} a ${DEFAULT_CATEGORY}` : ""}.`,
    taken: (type: CategoryType) => `Ya hay una categoría de ${type === "expense" ? "egresos" : "ingresos"} con ese nombre.`,
    takenEn: (type: CategoryType) => `Ya hay una categoría de ${type === "expense" ? "egresos" : "ingresos"} con ese nombre en inglés.`,
  },
  {
    en: {
      created: (label) => `The category ${label} was created.`,
      gone: "This category no longer exists.",
      defaultOnlyEmoji: `Only the emoji and the English name of “${DEFAULT_CATEGORY}” can be changed.`,
      nothing: "There was nothing to change.",
      saved: (label) => `The category ${label} was saved.`,
      cannotArchive: `“${DEFAULT_CATEGORY}” can't be archived: it's the default category.`,
      alreadyArchived: "The category is already archived.",
      archived: (label) => `The category ${label} was archived.`,
      notArchived: "The category isn't archived.",
      restored: (label) => `The category ${label} was restored.`,
      cannotDelete: `“${DEFAULT_CATEGORY}” can't be deleted: it's the default category.`,
      missingDefault: `The “${DEFAULT_CATEGORY}” category is missing: create it before deleting another one.`,
      deleted: (label, moved) =>
        `The category ${label} was deleted${moved ? `; ${moved} ${moved === 1 ? "transaction" : "transactions"} moved to ${DEFAULT_CATEGORY}` : ""}.`,
      taken: (type) => `There's already ${type === "expense" ? "an expense" : "an income"} category with that name.`,
      takenEn: (type) => `There's already ${type === "expense" ? "an expense" : "an income"} category with that English name.`,
    },
  },
);

/** Una categoría global por su id, o null (también con un id inválido). */
async function loadCategory(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({ id: category.id, type: category.type, name: category.name, nameEn: category.nameEn, emoji: category.emoji, archivedAt: category.archivedAt })
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

/** ¿Ya hay otra global de ese tipo con ese nombre en inglés (igual que nameTaken)? */
async function englishNameTaken(type: CategoryType, nameEn: string, exceptId?: string) {
  const rows = await db
    .select({ id: category.id, nameEn: category.nameEn })
    .from(category)
    .where(and(eq(category.type, type), isNull(category.userId)));
  return rows.some((row) => row.id !== exceptId && row.nameEn !== null && foldName(row.nameEn) === foldName(nameEn));
}


/** Todas las categorías globales, de los dos tipos, en orden alfabético con "Otros" al final. */
export async function listAdminCategories(): Promise<AdminCategory[]> {
  await requireAdmin();
  const rows = await db
    .select({
      id: category.id,
      type: category.type,
      name: category.name,
      nameEn: category.nameEn,
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

/** Crea una categoría global: aparece de inmediato en los formularios y el bot puede usarla. `nameEn`, opcional. */
export async function createCategory(input: { type: string; name: string; nameEn?: string; emoji: string }): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const locale = await getRequestLocale();
  const t = TEXTS[locale];
  const type: CategoryType = input.type === "income" ? "income" : "expense";
  const name = parseCategoryName(input.name, locale);
  if (!name.ok) return fail(name.error, "name");
  const nameEn = parseEnglishName(input.nameEn ?? "", locale);
  if (!nameEn.ok) return fail(nameEn.error, "nameEn");
  const emoji = parseEmoji(input.emoji, locale);
  if (!emoji.ok) return fail(emoji.error, "emoji");
  if (await nameTaken(type, name.value)) return fail(t.taken(type), "name");
  if (nameEn.value && (await englishNameTaken(type, nameEn.value))) return fail(t.takenEn(type), "nameEn");

  const created = { type, name: name.value, emoji: emoji.value };
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(category).values({ ...created, nameEn: nameEn.value }).returning({ id: category.id });
    await logChange(tx, {
      adminId: admin.id,
      categoryId: row.id,
      action: "created",
      ...created,
      details: nameEn.value ? { nameEn: nameEn.value } : {},
    });
  });
  return { ok: true, message: t.created(label(created)) };
}

/**
 * Cambia el nombre, el nombre en inglés o el emoji. A "Otros", solo el emoji y el nombre en inglés. Los
 * movimientos que la usan pasan a verse con el nombre nuevo.
 */
export async function updateCategory(input: { id: string; name: string; nameEn?: string; emoji: string }): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const locale = await getRequestLocale();
  const t = TEXTS[locale];
  const current = await loadCategory(input.id);
  if (!current) return fail(t.gone);
  const name = parseCategoryName(input.name, locale);
  if (!name.ok) return fail(name.error, "name");
  const nameEn = parseEnglishName(input.nameEn ?? "", locale);
  if (!nameEn.ok) return fail(nameEn.error, "nameEn");
  const emoji = parseEmoji(input.emoji, locale);
  if (!emoji.ok) return fail(emoji.error, "emoji");
  if (isDefaultCategory(current.name) && name.value !== current.name) {
    return fail(t.defaultOnlyEmoji, "name");
  }
  const englishChanged = nameEn.value !== current.nameEn;
  if (name.value === current.name && emoji.value === current.emoji && !englishChanged) return { ok: true, message: t.nothing };
  if (await nameTaken(current.type, name.value, current.id)) return fail(t.taken(current.type), "name");
  if (nameEn.value && (await englishNameTaken(current.type, nameEn.value, current.id))) return fail(t.takenEn(current.type), "nameEn");

  const updated = { name: name.value, emoji: emoji.value };
  await db.transaction(async (tx) => {
    await tx.update(category).set({ ...updated, nameEn: nameEn.value }).where(eq(category.id, current.id));
    await logChange(tx, {
      adminId: admin.id,
      categoryId: current.id,
      action: "updated",
      type: current.type,
      ...updated,
      details: {
        previousName: current.name,
        previousEmoji: current.emoji,
        ...(englishChanged && { nameEn: nameEn.value, previousNameEn: current.nameEn }),
      },
    });
  });
  return { ok: true, message: t.saved(label(updated)) };
}

/** Archiva: deja de aparecer en los formularios y el bot no la usa, pero los movimientos la conservan. */
export async function archiveCategory(input: { id: string; code: string }, now = new Date()): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const t = TEXTS[await getRequestLocale()];
  const current = await loadCategory(input.id);
  if (!current) return fail(t.gone);
  if (isDefaultCategory(current.name)) return fail(t.cannotArchive);
  if (current.archivedAt) return fail(t.alreadyArchived);
  const check = await confirmAdminCode(input.code, now);
  if (!check.ok) return fail(check.error, "code");

  await db.transaction(async (tx) => {
    await tx.update(category).set({ archivedAt: now }).where(eq(category.id, current.id));
    await logChange(tx, { adminId: admin.id, categoryId: current.id, action: "archived", type: current.type, name: current.name, emoji: current.emoji });
  });
  return { ok: true, message: t.archived(label(current)) };
}

/** Restaura una archivada: vuelve a los formularios y al bot. No pide el código (solo deshace un archivado). */
export async function restoreCategory(input: { id: string }): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const t = TEXTS[await getRequestLocale()];
  const current = await loadCategory(input.id);
  if (!current) return fail(t.gone);
  if (!current.archivedAt) return fail(t.notArchived);

  await db.transaction(async (tx) => {
    await tx.update(category).set({ archivedAt: null }).where(eq(category.id, current.id));
    await logChange(tx, { adminId: admin.id, categoryId: current.id, action: "restored", type: current.type, name: current.name, emoji: current.emoji });
  });
  return { ok: true, message: t.restored(label(current)) };
}

/**
 * Elimina la categoría. Sus movimientos (de todas las cuentas, también los eliminados) pasan a
 * "Otros" de su mismo tipo, en la misma transacción. Queda en el registro de cambios.
 */
export async function deleteCategory(input: { id: string; code: string }, now = new Date()): Promise<CategoryResult> {
  const admin = await requireAdmin();
  const t = TEXTS[await getRequestLocale()];
  const current = await loadCategory(input.id);
  if (!current) return fail(t.gone);
  if (isDefaultCategory(current.name)) return fail(t.cannotDelete);
  const [fallback] = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(and(eq(category.type, current.type), isNull(category.userId)))
    .then((rows) => rows.filter((row) => isDefaultCategory(row.name)));
  if (!fallback) return fail(t.missingDefault);
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
  return { ok: true, message: t.deleted(label(current), moved) };
}
