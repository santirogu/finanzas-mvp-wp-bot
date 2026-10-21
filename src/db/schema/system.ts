import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Cada corrida de una tarea programada de Vercel Cron (vercel.json → crons): cuándo empezó y terminó,
// si salió bien y qué hizo (src/modules/system/cron-runs.ts). La lee /admin/salud. Sin datos de nadie:
// solo cantidades y, si falló, el tipo del error (describeError, nunca su mensaje).
export const cronRun = pgTable(
  "cron_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Qué tarea: "limpieza" (/api/cron/limpieza).
    job: text("job").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    ok: boolean("ok").notNull(),
    // Lo que hizo, en cantidades ({ messages: 3, events: 0, transactions: 1 }); null si falló.
    result: jsonb("result").$type<Record<string, number>>(),
    // El tipo del error ("DrizzleQueryError (57P01)"); null si salió bien.
    error: text("error"),
  },
  (t) => [index("cron_run_job_started_at_idx").on(t.job, t.startedAt)],
);
