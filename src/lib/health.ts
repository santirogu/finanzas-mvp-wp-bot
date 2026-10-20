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

export type HealthResult = { ok: true } | { ok: false; problems: string[] };

/**
 * Revisa que la app pueda funcionar: configuración completa y base de datos al día.
 * Las dependencias se reciben como parámetros para probarla sin base de datos.
 */
export async function checkHealth({
  env = envVar,
  latestAppliedMigration,
  expectedMigration = LATEST_MIGRATION,
}: {
  env?: (name: string) => string | undefined;
  /** `when` de la última migración aplicada en la base, o null si no hay ninguna. */
  latestAppliedMigration: () => Promise<number | null>;
  expectedMigration?: number;
}): Promise<HealthResult> {
  const problems: string[] = [];

  const missing: string[] = REQUIRED_ENV.filter((name) => !env(name));
  if (!ANTHROPIC_CREDENTIALS.some((name) => env(name))) {
    missing.push(ANTHROPIC_CREDENTIALS.join(" o "));
  }
  if (missing.length > 0) problems.push(`faltan variables de entorno: ${missing.join(", ")}`);

  try {
    const applied = await latestAppliedMigration();
    // Stryker disable next-line ConditionalExpression: null < expectedMigration también es true (siempre hay migraciones)
    if (applied === null || applied < expectedMigration) {
      problems.push(
        `la base no tiene todas las migraciones: la última aplicada es ${applied ?? "ninguna"} y el código espera ${expectedMigration}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    problems.push(`no se pudo consultar la base de datos: ${message}`);
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true };
}
