// Prepara la base de datos de pruebas una vez por corrida:
// la crea si no existe, la deja vacía, aplica las migraciones y siembra las categorías.
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { category } from "../../src/db/schema";
import { DEFAULT_CATEGORIES } from "../../src/modules/transactions/default-categories";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta TEST_DATABASE_URL. Ejemplo: postgres://finanzas:finanzas@localhost:5432/finanzas_test",
    );
  }
  const parsed = new URL(url);
  const dbName = parsed.pathname.slice(1);
  // Salvaguarda: estas pruebas borran datos, nunca deben apuntar a otra base.
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL debe apuntar a una base terminada en "_test" (es "${dbName}")`,
    );
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
  await db
    .insert(category)
    .values(
      (["expense", "income"] as const).flatMap((type) =>
        DEFAULT_CATEGORIES[type].map(({ name, emoji }) => ({ type, name, emoji })),
      ),
    )
    .onConflictDoNothing();
  await client.end();
}
