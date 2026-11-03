import "server-only";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { category, categoryBudget, transaction } from "@/db/schema";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import type { MonthRange } from "@/lib/dates";
import { formatMoney, roundToCents } from "@/lib/money";
import type { ToastTone } from "@/lib/toasts";
import { getAppValues } from "@/modules/app-values/current";
import { categoryLabel } from "@/modules/transactions/category-name";
import { isCategoryAvailable, listCategories } from "@/modules/transactions/queries";
import { amountSchema } from "@/modules/transactions/validation";
import { type Budget, type BudgetCrossing, type BudgetProgress, budgetCrossings, budgetProgress } from "./progress";

// Los presupuestos de la persona (/presupuestos y el Resumen): un monto por mes para una categoría de egresos, el
// mismo cada mes hasta que lo cambie o lo quite (tabla category_budget). Reciben el userId ya validado por el Data
// Access Layer (src/lib/session.ts) y siempre filtran por él.

/** Los presupuestos de la persona, con el nombre de su categoría en el idioma de la página. */
export async function listBudgets(userId: string, locale: Locale = DEFAULT_LOCALE): Promise<Budget[]> {
  const rows = await db
    .select({
      categoryId: categoryBudget.categoryId,
      amount: categoryBudget.amount,
      name: category.name,
      nameEn: category.nameEn,
      emoji: category.emoji,
      archivedAt: category.archivedAt,
    })
    .from(categoryBudget)
    .innerJoin(category, eq(category.id, categoryBudget.categoryId))
    .where(eq(categoryBudget.userId, userId));
  return rows.map((row) => ({
    categoryId: row.categoryId,
    name: categoryLabel(row, locale),
    emoji: row.emoji,
    amount: row.amount,
    archived: row.archivedAt !== null,
  }));
}

/** Lo que suman en el mes los egresos de cada categoría (sin los borrados ni los que no tienen categoría). */
export async function getSpentByCategory(userId: string, range: MonthRange): Promise<Map<string, number>> {
  const rows = await db
    .select({ categoryId: transaction.categoryId, total: sql<string>`sum(${transaction.amount})` })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "expense"),
        isNull(transaction.deletedAt),
        gte(transaction.occurredOn, range.start),
        lt(transaction.occurredOn, range.end),
      ),
    )
    .groupBy(transaction.categoryId);
  return new Map(rows.flatMap((row) => (row.categoryId ? [[row.categoryId, Number(row.total)] as const] : [])));
}

/** Los presupuestos con lo que lleva cada categoría en el mes (`range`). */
export async function getBudgetProgress(userId: string, range: MonthRange, locale: Locale = DEFAULT_LOCALE): Promise<BudgetProgress[]> {
  const [budgets, spent, values] = await Promise.all([listBudgets(userId, locale), getSpentByCategory(userId, range), getAppValues()]);
  return budgetProgress(budgets, spent, locale, values.budgetNearShare);
}

/** Un movimiento recién registrado, para los avisos de presupuesto. */
export type AddedTransaction = { type: "income" | "expense"; categoryId: string | null; amount: number; occurredOn: string };

/**
 * Los presupuestos que cruzan un umbral con lo que se acaba de registrar (`added`): el de "se acerca" (Valores de
 * la app) o el límite (budgetCrossings). Solo cuentan los egresos con categoría del mes en curso (`current`): los avisos son de ahora.
 * Lo usan la respuesta del bot y el formulario de Egresos.
 */
export async function getBudgetCrossings(
  userId: string,
  current: MonthRange,
  added: AddedTransaction[],
  locale: Locale = DEFAULT_LOCALE,
): Promise<BudgetCrossing[]> {
  const sums = new Map<string, number>();
  for (const item of added) {
    if (item.type !== "expense" || !item.categoryId || item.occurredOn < current.start || item.occurredOn >= current.end) continue;
    sums.set(item.categoryId, roundToCents((sums.get(item.categoryId) ?? 0) + item.amount));
  }
  if (sums.size === 0) return [];
  const [budgets, spent, values] = await Promise.all([listBudgets(userId, locale), getSpentByCategory(userId, current), getAppValues()]);
  return budgetCrossings(budgets, spent, sums, values.budgetNearShare);
}

/** Las categorías de egresos que se pueden elegir para un presupuesto nuevo: las disponibles que todavía no tienen. */
export async function listBudgetCategories(userId: string, locale: Locale = DEFAULT_LOCALE) {
  const [categories, budgets] = await Promise.all([listCategories(userId, "expense", locale), listBudgets(userId, locale)]);
  const taken = new Set(budgets.map((budget) => budget.categoryId));
  return categories.filter((option) => !taken.has(option.id));
}

const TEXTS = texts(
  {
    category: "Elige una categoría.",
    saved: (name: string, amount: string) => `Se guardó el presupuesto de ${name}: ${amount} al mes`,
    changed: (name: string, amount: string) => `Se cambió el presupuesto de ${name}: ${amount} al mes`,
    removed: (name: string) => `Se quitó el presupuesto de ${name}`,
    notFound: "Ese presupuesto ya no existe.",
  },
  {
    en: {
      category: "Choose a category.",
      saved: (name, amount) => `The ${name} budget was saved: ${amount} a month`,
      changed: (name, amount) => `The ${name} budget was changed: ${amount} a month`,
      removed: (name) => `The ${name} budget was removed`,
      notFound: "That budget no longer exists.",
    },
  },
);

export type BudgetResult = { ok: true; message: string; tone: ToastTone } | { ok: false; error: string; field?: "categoryId" | "amount" };

/** La categoría de un presupuesto propio (aunque esté archivada) o una disponible de egresos; null si no es ninguna. */
async function budgetCategory(userId: string, categoryId: string, locale: Locale) {
  const [row] = await db
    .select({ name: category.name, nameEn: category.nameEn, budgetId: categoryBudget.id })
    .from(category)
    .leftJoin(categoryBudget, and(eq(categoryBudget.categoryId, category.id), eq(categoryBudget.userId, userId)))
    .where(and(eq(category.id, categoryId), eq(category.type, "expense"), or(isNull(category.userId), eq(category.userId, userId))));
  if (!row) return null;
  // Uno nuevo, solo con una categoría disponible (no archivada); el que ya tiene, se puede cambiar igual.
  if (!row.budgetId && !(await isCategoryAvailable(userId, categoryId, "expense"))) return null;
  return { name: categoryLabel(row, locale), exists: row.budgetId !== null };
}

/**
 * Pone o cambia el presupuesto de una categoría de egresos (`categoryId`) con el monto que escribió la persona
 * (`amount`, con los separadores del idioma de la página). Uno nuevo solo con una categoría disponible; el de una que
 * el admin archivó se puede cambiar.
 */
export async function saveBudget(
  user: { id: string; currency: string },
  raw: { categoryId: unknown; amount: unknown },
  locale: Locale = DEFAULT_LOCALE,
): Promise<BudgetResult> {
  const t = TEXTS[locale];
  const id = z.uuid().safeParse(raw.categoryId);
  const found = id.success ? await budgetCategory(user.id, id.data, locale) : null;
  if (!id.success || !found) return { ok: false, error: t.category, field: "categoryId" };
  const amount = amountSchema(locale).safeParse(String(raw.amount ?? ""));
  if (!amount.success) return { ok: false, error: amount.error.issues[0].message, field: "amount" };
  await db
    .insert(categoryBudget)
    .values({ userId: user.id, categoryId: id.data, amount: amount.data })
    .onConflictDoUpdate({ target: [categoryBudget.userId, categoryBudget.categoryId], set: { amount: amount.data, updatedAt: new Date() } });
  const money = formatMoney(amount.data, user.currency, locale);
  return { ok: true, message: found.exists ? t.changed(found.name, money) : t.saved(found.name, money), tone: "success" };
}

/** Quita el presupuesto de una categoría (`categoryId`). */
export async function removeBudget(userId: string, raw: { categoryId: unknown }, locale: Locale = DEFAULT_LOCALE): Promise<BudgetResult> {
  const t = TEXTS[locale];
  const id = z.uuid().safeParse(raw.categoryId);
  if (!id.success) return { ok: false, error: t.notFound };
  const [removed] = await db
    .delete(categoryBudget)
    .where(and(eq(categoryBudget.userId, userId), eq(categoryBudget.categoryId, id.data)))
    .returning({ categoryId: categoryBudget.categoryId });
  if (!removed) return { ok: false, error: t.notFound };
  const [row] = await db.select({ name: category.name, nameEn: category.nameEn }).from(category).where(eq(category.id, id.data));
  return { ok: true, message: t.removed(categoryLabel(row, locale)), tone: "removal" };
}
