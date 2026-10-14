import "server-only";
import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, transaction, type TransactionType } from "@/db/schema";
import type { MonthRange } from "@/lib/dates";

// Todas las consultas reciben el userId ya validado por el Data Access Layer
// (src/lib/session.ts) y siempre filtran por él.

const activeInMonth = (userId: string, range: MonthRange) =>
  and(
    eq(transaction.userId, userId),
    isNull(transaction.deletedAt),
    gte(transaction.occurredOn, range.start),
    lt(transaction.occurredOn, range.end),
  );

export async function getMonthlySummary(userId: string, range: MonthRange) {
  const [row] = await db
    .select({
      income: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.type} = 'income'), 0)`,
      expense: sql<string>`coalesce(sum(${transaction.amount}) filter (where ${transaction.type} = 'expense'), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transaction)
    .where(activeInMonth(userId, range));

  const income = Number(row.income);
  const expense = Number(row.expense);
  return { income, expense, balance: income - expense, count: row.count };
}

export async function getTotalsByCategory(userId: string, type: TransactionType, range: MonthRange) {
  const rows = await db
    .select({
      name: sql<string>`coalesce(${category.name}, 'Sin categoría')`,
      emoji: sql<string>`coalesce(${category.emoji}, '•')`,
      total: sql<string>`sum(${transaction.amount})`,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(and(activeInMonth(userId, range), eq(transaction.type, type)))
    .groupBy(category.name, category.emoji)
    .orderBy(desc(sql`sum(${transaction.amount})`));

  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

export async function listTransactions(
  userId: string,
  range: MonthRange,
  options: { type?: TransactionType; limit?: number } = {},
) {
  return db
    .select({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description,
      occurredOn: transaction.occurredOn,
      source: transaction.source,
      categoryName: category.name,
      categoryEmoji: category.emoji,
    })
    .from(transaction)
    .leftJoin(category, eq(category.id, transaction.categoryId))
    .where(
      and(
        activeInMonth(userId, range),
        options.type ? eq(transaction.type, options.type) : undefined,
      ),
    )
    .orderBy(desc(transaction.occurredOn), desc(transaction.createdAt))
    .limit(options.limit ?? 500);
}

export type TransactionRow = Awaited<ReturnType<typeof listTransactions>>[number];

/** Un movimiento propio y no eliminado, para editarlo; null si no existe o es de otro usuario. */
export async function getTransaction(userId: string, id: string) {
  const [row] = await db
    .select({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      categoryId: transaction.categoryId,
      occurredOn: transaction.occurredOn,
      source: transaction.source,
    })
    .from(transaction)
    .where(and(eq(transaction.id, id), eq(transaction.userId, userId), isNull(transaction.deletedAt)));
  return row ?? null;
}

export type EditableTransaction = NonNullable<Awaited<ReturnType<typeof getTransaction>>>;

export async function listCategories(userId: string, type: TransactionType) {
  return db
    .select({ id: category.id, name: category.name, emoji: category.emoji })
    .from(category)
    .where(
      and(eq(category.type, type), or(isNull(category.userId), eq(category.userId, userId))),
    )
    .orderBy(asc(category.name));
}

export async function isCategoryAvailable(userId: string, categoryId: string, type: TransactionType) {
  const [row] = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.id, categoryId),
        eq(category.type, type),
        or(isNull(category.userId), eq(category.userId, userId)),
      ),
    )
    .limit(1);
  return Boolean(row);
}
