import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// Número de WhatsApp vinculado a cada usuario (uno por usuario y uno por número).
export const whatsappLink = pgTable("whatsapp_link", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  // Formato de WhatsApp: solo dígitos con indicativo, p. ej. 573001234567.
  phone: text("phone").notNull().unique(),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

// Código temporal que el usuario envía al bot ("VINCULAR 123456") para probar que el número es suyo.
// Se guarda solo el hash del código.
export const whatsappLinkCode = pgTable("whatsapp_link_code", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const whatsappMessageStatus = pgEnum("whatsapp_message_status", [
  "received",
  "processed",
  "failed",
  "link_failed",
]);

// Registro de cada mensaje entrante: auditoría y, sobre todo, idempotencia
// (Meta puede entregar el mismo webhook más de una vez).
export const whatsappMessage = pgTable(
  "whatsapp_message",
  {
    id: text("id").primaryKey(), // wamid que asigna WhatsApp
    phone: text("phone").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    status: whatsappMessageStatus("status").notNull().default("received"),
    intent: jsonb("intent"),
    reply: text("reply"),
    error: text("error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    // Cuándo se reservó una llamada a Claude para este mensaje: el tope de mensajes interpretados por
    // cuenta (src/modules/bot/ai-quota.ts) cuenta estas filas.
    aiRequestedAt: timestamp("ai_requested_at", { withTimezone: true }),
  },
  (t) => [
    index("whatsapp_message_phone_received_idx").on(t.phone, t.receivedAt),
    index("whatsapp_message_user_ai_requested_idx").on(t.userId, t.aiRequestedAt),
  ],
);

// La configuración del bot que cambia el admin en /admin/bot (src/modules/admin/bot/bot-settings.ts),
// en una sola fila (id = 1). Sin fila, valen los de src/modules/bot/settings.ts (Claude activo y
// AI_LIMITS). Cada cambio queda en el historial (account_event, con el admin).
export const botSetting = pgTable(
  "bot_setting",
  {
    id: integer("id").primaryKey().default(1),
    // En pausa, el bot no llama a Claude: el texto libre recibe un aviso y los comandos siguen.
    claudePaused: boolean("claude_paused").notNull().default(false),
    // Tope de mensajes interpretados con Claude por cuenta (src/modules/bot/ai-quota.ts).
    aiPerHour: integer("ai_per_hour").notNull(),
    aiPerDay: integer("ai_per_day").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    check("bot_setting_single_row", sql`${t.id} = 1`),
    check("bot_setting_ai_limits", sql`${t.aiPerHour} > 0 and ${t.aiPerHour} <= ${t.aiPerDay}`),
  ],
);
