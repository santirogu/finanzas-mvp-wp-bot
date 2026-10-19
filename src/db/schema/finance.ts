import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const transactionType = pgEnum("transaction_type", ["income", "expense"]);
export const transactionSource = pgEnum("transaction_source", ["web", "whatsapp"]);

// Categorías globales (user_id NULL), que administra el admin en /admin/categorias, + futuras
// categorías propias de cada usuario.
export const category = pgTable(
  "category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    type: transactionType("type").notNull(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("•"),
    // Archivada por el admin: no aparece en los formularios ni la usa el bot, pero los movimientos
    // que ya la tienen la conservan.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("category_global_type_name_uq")
      .on(t.type, t.name)
      .where(sql`${t.userId} is null`),
    uniqueIndex("category_user_type_name_uq")
      .on(t.userId, t.type, t.name)
      .where(sql`${t.userId} is not null`),
  ],
);

export const transaction = pgTable(
  "transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: transactionType("type").notNull(),
    // Monto en pesos con centavos: decimal exacto en la base (nunca float). 18 dígitos: cabe cualquier
    // monto que aceptaba la columna anterior (entera); la app limita a MAX_AMOUNT (src/lib/money.ts).
    amount: numeric("amount", { precision: 18, scale: 2, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("COP"),
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    // Fecha calendario del movimiento, en la zona horaria del usuario.
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    source: transactionSource("source").notNull().default("web"),
    // ID del mensaje de WhatsApp que originó el registro: evita duplicados si Meta reenvía el webhook.
    externalId: text("external_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("transaction_user_date_idx").on(t.userId, t.occurredOn),
    check("transaction_amount_positive", sql`${t.amount} > 0`),
  ],
);

// Los gastos fijos marcados a mano en Reportes (src/modules/reports/fixed-choices.ts): "include" suma uno
// que el detector todavía no ve (lleva pocos meses) y "exclude" quita uno que detectó por error. La clave
// es la descripción como la agrupa el detector: sin mayúsculas, tildes ni espacios de más (searchKey).
// Se borra con la cuenta (cascada).
export const fixedExpenseChoiceKind = pgEnum("fixed_expense_choice_kind", ["include", "exclude"]);

export const fixedExpenseChoice = pgTable(
  "fixed_expense_choice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    descriptionKey: text("description_key").notNull(),
    choice: fixedExpenseChoiceKind("choice").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fixed_expense_choice_user_key_uq").on(t.userId, t.descriptionKey)],
);

export type Category = typeof category.$inferSelect;
export type Transaction = typeof transaction.$inferSelect;
export type TransactionType = (typeof transactionType.enumValues)[number];
