import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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

// La configuración de la app que cambia el admin (/admin/configuracion, src/modules/admin/configuracion/): una
// sola fila. Por ahora, quién puede crear una cuenta: "open" (cualquiera, lo de siempre), "closed" (nadie) o
// "invite" (solo los correos de signup_invite). Sin la fila, abiertos.
export const appSetting = pgTable(
  "app_setting",
  {
    id: integer("id").primaryKey().default(1),
    signupMode: text("signup_mode").notNull().default("open"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    check("app_setting_single_row", sql`${t.id} = 1`),
    check("app_setting_signup_mode", sql`${t.signupMode} in ('open', 'closed', 'invite')`),
  ],
);

// Los correos invitados a crear una cuenta cuando los registros son "solo con invitación". El correo va en
// minúsculas y sin espacios (como lo compara el registro). Al registrarse, la invitación queda marcada
// (used_at) y se borra si esa persona elimina su cuenta (deleteAccountData).
export const signupInvite = pgTable(
  "signup_invite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("signup_invite_email_uq").on(t.email)],
);

// El aviso para todos (/admin/configuracion): uno a la vez, arriba en la app, el login y el registro hasta ends_at.
// "info" (la marca) o "important" (rojo, como las alertas); message_en, opcional (vacío: se ve message). Quitarlo
// borra la fila. published_at también es su versión: quien lo cerró lo vuelve a ver si se publica otro o cambia.
export const appNotice = pgTable(
  "app_notice",
  {
    id: integer("id").primaryKey().default(1),
    message: text("message").notNull(),
    messageEn: text("message_en"),
    tone: text("tone").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    publishedBy: text("published_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [check("app_notice_single_row", sql`${t.id} = 1`), check("app_notice_tone", sql`${t.tone} in ('info', 'important')`)],
);
