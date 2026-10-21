import journal from "../../drizzle/meta/_journal.json";
import { envVar } from "./env";

// Sin estas variables la app arranca, pero no funciona en producción (sesiones, base de datos,
// bot de WhatsApp, limpieza diaria de datos vencidos). Para Claude basta con una de las dos credenciales.
export const REQUIRED_ENV = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  // Vercel Cron la manda para llamar a la limpieza diaria (src/app/api/cron/limpieza/route.ts).
  "CRON_SECRET",
] as const;
export const ANTHROPIC_CREDENTIALS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const;

// drizzle-kit registra cada migración aplicada con el `when` de su entrada en el journal: la base
// está al día si la última registrada es igual o posterior a la última que trae el código.
export const LATEST_MIGRATION = Math.max(...journal.entries.map((entry) => entry.when));

/** Cuántas migraciones trae el código. */
export const MIGRATION_COUNT = journal.entries.length;

/** Cuántas migraciones del código tiene una base cuya última aplicada es `applied`. */
export const appliedMigrationCount = (applied: number | null) =>
  applied === null ? 0 : journal.entries.filter((entry) => entry.when <= applied).length;

/** El nombre de la migración con ese `when` ("0022_nombre-en-ingles-de-las-categorias"), o null si el código no la tiene. */
export const migrationName = (when: number | null) => journal.entries.find((entry) => entry.when === when)?.tag ?? null;

/** Lo que revisa checkHealth, cada cosa por separado: /api/health lo resume y /admin/salud lo muestra. */
export type HealthReport = {
  /** Las variables que faltan, por nombre (nunca su valor). */
  missingEnv: string[];
  /** `when` de la última migración aplicada, o null si no hay ninguna (o si la base no respondió). */
  appliedMigration: number | null;
  expectedMigration: number;
  /** El error al consultar la base, o null si respondió. */
  databaseError: unknown;
};

export type HealthDeps = {
  env?: (name: string) => string | undefined;
  /** `when` de la última migración aplicada en la base, o null si no hay ninguna. */
  latestAppliedMigration: () => Promise<number | null>;
  expectedMigration?: number;
};

/** Revisa la configuración y la base. Las dependencias se reciben como parámetros para probarla sin base de datos. */
export async function healthReport({ env = envVar, latestAppliedMigration, expectedMigration = LATEST_MIGRATION }: HealthDeps): Promise<HealthReport> {
  const missingEnv: string[] = REQUIRED_ENV.filter((name) => !env(name));
  if (!ANTHROPIC_CREDENTIALS.some((name) => env(name))) missingEnv.push(ANTHROPIC_CREDENTIALS.join(" o "));
  try {
    return { missingEnv, appliedMigration: await latestAppliedMigration(), expectedMigration, databaseError: null };
  } catch (error) {
    return { missingEnv, appliedMigration: null, expectedMigration, databaseError: error ?? "error desconocido" };
  }
}

/** Si la base respondió y tiene todas las migraciones del código (o más: la versión anterior tras un rollback). */
export const migrationsUpToDate = (report: HealthReport) =>
  // Stryker disable next-line ConditionalExpression,LogicalOperator: null >= expectedMigration también es false
  report.databaseError === null && report.appliedMigration !== null && report.appliedMigration >= report.expectedMigration;

export type HealthResult = { ok: true } | { ok: false; problems: string[] };

/** Revisa que la app pueda funcionar: configuración completa y base de datos al día. */
export async function checkHealth(deps: HealthDeps): Promise<HealthResult> {
  const report = await healthReport(deps);
  const problems: string[] = [];
  if (report.missingEnv.length > 0) problems.push(`faltan variables de entorno: ${report.missingEnv.join(", ")}`);
  if (report.databaseError !== null) {
    const { databaseError: error } = report;
    problems.push(`no se pudo consultar la base de datos: ${error instanceof Error ? error.message : String(error)}`);
  } else if (!migrationsUpToDate(report)) {
    problems.push(
      `la base no tiene todas las migraciones: la última aplicada es ${report.appliedMigration ?? "ninguna"} y el código espera ${report.expectedMigration}`,
    );
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true };
}
