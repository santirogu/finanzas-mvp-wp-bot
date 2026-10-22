import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  smallint,
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
    // El nombre en inglés de una categoría global (opcional, lo pone el admin en /admin/categorias): con la
    // app en inglés se ve este; sin él, el de siempre. El bot usa siempre `name`.
    nameEn: text("name_en"),
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
    uniqueIndex("category_global_type_name_en_uq")
      .on(t.type, t.nameEn)
      .where(sql`${t.userId} is null and ${t.nameEn} is not null`),
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

// Los presupuestos de la persona (/presupuestos y el Resumen, src/modules/budgets/): un monto por mes para una
// categoría de egresos, el mismo cada mes hasta que lo cambie o lo quite. Se borra con la cuenta y con la
// categoría, si el admin la elimina (cascada).
export const categoryBudget = pgTable(
  "category_budget",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 18, scale: 2, mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("category_budget_user_category_uq").on(t.userId, t.categoryId),
    check("category_budget_amount_positive", sql`${t.amount} > 0`),
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

// Las notas del historial de un gasto fijo (Reportes, src/modules/reports/history-notes.ts): una por
// cambio de valor, es decir, por gasto (la clave de la descripción, como fixed_expense_choice) y mes
// ("YYYY-MM"). Las escribe la persona; se borran con la cuenta (cascada).
export const FIXED_NOTE_MAX_LENGTH = 280;

export const fixedExpenseNote = pgTable(
  "fixed_expense_note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    descriptionKey: text("description_key").notNull(),
    month: text("month").notNull(),
    note: text("note").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fixed_expense_note_user_key_month_uq").on(t.userId, t.descriptionKey, t.month),
    check("fixed_expense_note_length", sql`char_length(${t.note}) between 1 and ${sql.raw(String(FIXED_NOTE_MAX_LENGTH))}`),
    check("fixed_expense_note_month", sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

// Los pagos de un gasto fijo que la persona marcó "Este pago ya no aplica" en los avisos de próximos
// pagos (Resumen, src/modules/reports/upcoming.ts): por gasto (la clave de la descripción, como
// fixed_expense_choice) y mes ("YYYY-MM"). Solo oculta el aviso de ese mes. Se borran con la cuenta.
export const fixedPaymentSkip = pgTable(
  "fixed_payment_skip",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    descriptionKey: text("description_key").notNull(),
    month: text("month").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fixed_payment_skip_user_key_month_uq").on(t.userId, t.descriptionKey, t.month),
    check("fixed_payment_skip_month", sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

// La configuración de los avisos de próximos pagos (Mi cuenta → Notificaciones): si están prendidos y con cuántos
// días de anticipación (de 0, el mismo día, a 10). Sin fila, los valores por defecto (prendidos, 3 días:
// src/modules/reports/upcoming-settings.ts). Se borra con la cuenta.
export const UPCOMING_DAYS_MAX = 10;

export const notificationSetting = pgTable(
  "notification_setting",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    upcomingEnabled: boolean("upcoming_enabled").notNull().default(true),
    upcomingDays: smallint("upcoming_days").notNull().default(3),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("notification_setting_upcoming_days", sql`${t.upcomingDays} between 0 and ${sql.raw(String(UPCOMING_DAYS_MAX))}`)],
);

// Las notificaciones de la campana que la persona marcó como leídas: salen de la campana (el aviso sigue
// en el Resumen). Por su id (src/modules/notifications/notifications.ts: "pago|YYYY-MM|<clave>"; otros
// tipos, con otro prefijo). Se borran con la cuenta.
export const NOTIFICATION_ID_MAX_LENGTH = 200;

export const notificationRead = pgTable(
  "notification_read",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    notificationId: text("notification_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_read_user_notification_uq").on(t.userId, t.notificationId),
    check("notification_read_id_length", sql`char_length(${t.notificationId}) between 1 and ${sql.raw(String(NOTIFICATION_ID_MAX_LENGTH))}`),
  ],
);

export type Category = typeof category.$inferSelect;
export type Transaction = typeof transaction.$inferSelect;
export type TransactionType = (typeof transactionType.enumValues)[number];
