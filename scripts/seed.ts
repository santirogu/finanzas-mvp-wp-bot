// Inserta las categorías globales por defecto. Es idempotente: se puede correr varias veces.
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { category } from "../src/db/schema";
import { DEFAULT_CATEGORIES } from "../src/modules/transactions/default-categories";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const db = drizzle(client);

  const rows = (["expense", "income"] as const).flatMap((type) =>
    DEFAULT_CATEGORIES[type].map(({ name, emoji }) => ({ type, name, emoji })),
  );
  const inserted = await db.insert(category).values(rows).onConflictDoNothing().returning();
  console.log(`Categorías nuevas: ${inserted.length} (de ${rows.length})`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
