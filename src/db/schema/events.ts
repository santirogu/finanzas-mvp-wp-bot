import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// Historial de cada cuenta: registro y vinculación de WhatsApp, y lo que el admin hizo con ella
// (src/modules/account/events.ts). Lo ve el admin en /admin. Se borra con la cuenta (cascada) y, los
// intentos de números sin cuenta, con pnpm messages:cleanup. De una cuenta que eliminó el admin
// queda solo "account_deleted", sin datos de ella.
export const accountEventType = pgEnum("account_event_type", [
  "registered",
  "whatsapp_code_created",
  "whatsapp_linked",
  "whatsapp_unlinked",
  "whatsapp_link_failed",
  // Acciones del admin (/admin/usuarios), con admin_id.
  "login_unlocked",
  "sessions_revoked",
  "account_deleted",
  "account_suspended",
  "account_reactivated",
  // El super admin le dio o le quitó el rol de admin a una cuenta, con admin_id.
  "admin_granted",
  "admin_revoked",
  // Configuración del bot (/admin/bot), con admin_id y sin cuenta ni número.
  "bot_claude_paused",
  "bot_claude_resumed",
  "bot_limits_changed",
  "bot_monthly_limit_changed",
  "bot_replies_resent",
]);

/** Detalle de un evento: el motivo de una desvinculación o de un intento fallido. */
export type AccountEventDetails = {
  reason?: "by_user" | "by_admin" | "number_moved" | "number_changed" | "invalid_code" | "rate_limited";
  /** Cuántas sesiones cerró el admin (sessions_revoked, account_suspended, admin_granted, admin_revoked). */
  sessions?: number;
  /** El motivo que escribió el admin al suspender (interno: solo lo ve el admin). */
  note?: string;
  /** Reconstruido al crear el historial a partir de lo que ya había en la base. */
  reconstructed?: boolean;
  /** Los topes de Claude por cuenta que dejó el admin, y los de antes (bot_limits_changed). */
  limits?: { perHour: number; perDay: number };
  previousLimits?: { perHour: number; perDay: number };
  /** El tope mensual de tokens que dejó el admin, y el de antes; null: sin tope (bot_monthly_limit_changed). */
  monthlyLimit?: number | null;
  previousMonthlyLimit?: number | null;
  /** Cuántas respuestas reenvió el admin y cuántas no salieron otra vez (bot_replies_resent). */
  resent?: number;
  failed?: number;
};

export const accountEvent = pgTable(
  "account_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Sin cuenta: un intento de vinculación con un código inválido (no se sabe de quién era) o una
    // cuenta que eliminó el admin.
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    // El admin que lo hizo (acciones del admin); null en lo que hizo la propia cuenta o el bot.
    adminId: text("admin_id").references(() => user.id, { onDelete: "set null" }),
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
