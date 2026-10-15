import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

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
