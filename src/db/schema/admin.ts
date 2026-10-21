import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { category, transactionType } from "./finance";

// El último código de Google Authenticator con el que cada admin confirmó una acción
// (src/modules/admin/shared/confirm-code.ts): guarda su período de 30 s para que el mismo código, u
// otro anterior, no sirva otra vez.
export const adminCodeUse = pgTable("admin_code_use", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastStep: bigint("last_step", { mode: "number" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
});

// Registro de cambios de las categorías globales (/admin/categorias): quién hizo qué y cuándo. Guarda
// el nombre y el emoji de ese momento para que una categoría eliminada se siga leyendo aquí.
export const categoryChangeType = pgEnum("category_change_type", ["created", "updated", "archived", "restored", "deleted"]);

export type CategoryChangeDetails = {
  /** Antes de editarla (updated). */
  previousName?: string;
  previousEmoji?: string;
  /** El nombre en inglés, si cambió al editarla (updated; null: sin nombre en inglés). */
  nameEn?: string | null;
  previousNameEn?: string | null;
  /** Cuántos movimientos pasaron a "Otros" al eliminarla (deleted). */
  moved?: number;
};

export const categoryChange = pgTable(
  "category_change",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // null si se eliminó la cuenta del admin.
    adminId: text("admin_id").references(() => user.id, { onDelete: "set null" }),
    // null si la categoría se eliminó.
    categoryId: uuid("category_id").references(() => category.id, { onDelete: "set null" }),
    action: categoryChangeType("action").notNull(),
    type: transactionType("type").notNull(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    details: jsonb("details").$type<CategoryChangeDetails>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("category_change_created_at_idx").on(t.createdAt)],
);
