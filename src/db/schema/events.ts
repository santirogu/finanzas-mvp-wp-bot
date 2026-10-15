import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// Historial de cada cuenta: registro y vinculación de WhatsApp (src/modules/account/events.ts). Lo
// ve el admin en /admin. Se borra con la cuenta (cascada) y, los intentos de números sin cuenta,
// con pnpm messages:cleanup.
export const accountEventType = pgEnum("account_event_type", [
  "registered",
  "whatsapp_code_created",
  "whatsapp_linked",
  "whatsapp_unlinked",
  "whatsapp_link_failed",
]);

/** Detalle de un evento: el motivo de una desvinculación o de un intento fallido. */
export type AccountEventDetails = {
  reason?: "by_user" | "number_moved" | "number_changed" | "invalid_code" | "rate_limited";
  /** Reconstruido al crear el historial a partir de lo que ya había en la base. */
  reconstructed?: boolean;
};

export const accountEvent = pgTable(
  "account_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Sin cuenta: un intento de vinculación con un código inválido (no se sabe de quién era).
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    type: accountEventType("type").notNull(),
    // Número de WhatsApp completo (solo lo ve el admin; ver /privacidad).
    phone: text("phone"),
    details: jsonb("details").$type<AccountEventDetails>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("account_event_created_at_idx").on(t.createdAt),
    index("account_event_user_created_at_idx").on(t.userId, t.createdAt),
    index("account_event_phone_idx").on(t.phone),
  ],
);
