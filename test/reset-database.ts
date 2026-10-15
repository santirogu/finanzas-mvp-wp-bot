// Deja una base de pruebas lista: la crea si no existe, la vacía, aplica las migraciones y siembra
// las categorías. La usan las pruebas de integración y las E2E (cada una con su propia base).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { seedDefaultCategories } from "../src/db/seed-categories";

export async function resetTestDatabase(url: string | undefined, variable: string) {
  if (!url) {
    throw new Error(
      `Falta ${variable}. Ejemplo: postgres://finanzas:finanzas@localhost:5432/finanzas_test`,
    );
  }
  const parsed = new URL(url);
  const dbName = parsed.pathname.slice(1);
  // Salvaguarda: estas pruebas borran datos, nunca deben apuntar a otra base.
  if (!dbName.endsWith("_test")) {
    throw new Error(`${variable} debe apuntar a una base terminada en "_test" (es "${dbName}")`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${dbName}`;
  if (!exists) await admin.unsafe(`create database "${dbName}"`);
  await admin.end();

  const client = postgres(url, { max: 1, onnotice: () => {} });
  await client.unsafe("drop schema if exists drizzle cascade");
  await client.unsafe("drop schema if exists public cascade");
  await client.unsafe("create schema public");
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "drizzle" });
  await seedDefaultCategories(db);
  await client.end();
}
