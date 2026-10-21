import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { latestAppliedMigration } from "@/db/migrations-status";
import { cronRun } from "@/db/schema";
import { buildInfo, type BuildInfo } from "@/lib/build-info";
import { healthReport, type HealthReport } from "@/lib/health";
import { describeError } from "@/lib/safe-log";
import { requireAdmin } from "@/lib/session";
import { CLEANUP_JOB } from "@/modules/system/cron-runs";
import { CLEANUP_RUNS_SHOWN, healthcheckOk, healthProblems, type CleanupRunSummary, type HealthProblem } from "./health-view";

// Salud del sistema (/admin/salud) y su tarjeta del Inicio: la configuración, las migraciones, la base y
// la limpieza diaria. Solo lee, y sin datos de nadie: nombres de variables (nunca sus valores), tamaños,
// cantidades y el tipo de los errores.

export type SystemHealth = {
  report: HealthReport;
  /** Lo mismo que respondería /api/health. */
  healthcheckOk: boolean;
  /** Cuánto tardó la base en responder un "select 1" (ms), o null si no respondió. */
  latencyMs: number | null;
  lastCleanup: CleanupRunSummary | null;
  build: BuildInfo;
  problems: HealthProblem[];
};

async function collectHealth(now: Date): Promise<SystemHealth> {
  const build = buildInfo();
  const report = await healthReport({ latestAppliedMigration });
  let latencyMs: number | null = null;
  let lastCleanup: CleanupRunSummary | null = null;
  if (report.databaseError === null) {
    try {
      const start = performance.now();
      await db.execute(sql`select 1`);
      latencyMs = Math.max(1, Math.round(performance.now() - start));
      [lastCleanup = null] = await db
        .select({ startedAt: cronRun.startedAt, ok: cronRun.ok })
        .from(cronRun)
        .where(eq(cronRun.job, CLEANUP_JOB))
        .orderBy(desc(cronRun.startedAt))
        .limit(1);
    } catch (error) {
      console.error("[salud] no se pudo consultar la base", describeError(error));
    }
  }
  const problems = healthProblems({ report, lastCleanup, builtAt: build.builtAt, now });
  return { report, healthcheckOk: healthcheckOk(report), latencyMs, lastCleanup, build, problems };
}

/** Todo lo que muestra la sección Estado de /admin/salud. */
export async function systemHealth(now = new Date()): Promise<SystemHealth> {
  await requireAdmin();
  return collectHealth(now);
}

/** Para la tarjeta del Inicio: los problemas (vacío: todo en orden). */
export async function healthSummary(now = new Date()): Promise<{ problems: HealthProblem[] }> {
  await requireAdmin();
  const { problems } = await collectHealth(now);
  return { problems };
}

export type DatabaseTable = { name: string; bytes: number; rows: number };
export type DatabaseDetails = { version: string; bytes: number; tables: DatabaseTable[] };

/**
 * La versión de Postgres, cuánto ocupa la base y cada tabla de la app (con sus índices), de la más
 * grande a la más chica. Las filas son las que estima Postgres (pg_stat_user_tables): al día, sin contarlas.
 */
export async function databaseDetails(): Promise<DatabaseDetails> {
  await requireAdmin();
  const [[version], [size], tables] = await Promise.all([
    db.execute<{ version: string }>(sql`select current_setting('server_version') as version`),
    db.execute<{ bytes: string }>(sql`select pg_database_size(current_database()) as bytes`),
    db.execute<{ name: string; bytes: string; rows: string }>(sql`
      select c.relname as name, pg_total_relation_size(c.oid) as bytes, coalesce(s.n_live_tup, 0) as rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_user_tables s on s.relid = c.oid
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc, c.relname`),
  ]);
  return {
    version: version.version.split(" ")[0],
    bytes: Number(size.bytes),
    tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.rows) })),
  };
}

export type CleanupRun = { startedAt: Date; finishedAt: Date; ok: boolean; result: Record<string, number> | null; error: string | null };

/** Las últimas corridas de la limpieza diaria, de la más nueva a la más vieja. */
export async function recentCleanupRuns(): Promise<CleanupRun[]> {
  await requireAdmin();
  return db
    .select({ startedAt: cronRun.startedAt, finishedAt: cronRun.finishedAt, ok: cronRun.ok, result: cronRun.result, error: cronRun.error })
    .from(cronRun)
    .where(eq(cronRun.job, CLEANUP_JOB))
    .orderBy(desc(cronRun.startedAt))
    .limit(CLEANUP_RUNS_SHOWN);
}
