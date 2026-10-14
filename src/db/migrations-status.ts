import { sql } from "drizzle-orm";
import { db } from ".";

/**
 * `when` de la última migración aplicada (drizzle-kit la guarda en `created_at`), o null si la
 * base no tiene ninguna. Falla si la tabla de migraciones no existe.
 */
export async function latestAppliedMigration(database = db): Promise<number | null> {
  const rows = await database.execute<{ latest: string | null }>(
    sql`select max(created_at) as latest from drizzle.__drizzle_migrations`,
  );
  const latest = rows[0]?.latest;
  return latest == null ? null : Number(latest);
}
