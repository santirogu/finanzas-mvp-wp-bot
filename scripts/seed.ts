// Crea las categorías globales por defecto, solo si la base no tiene ninguna (ver
// src/db/seed-categories.ts). Corre en cada despliegue y se puede correr varias veces.
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { seedDefaultCategories } from "../src/db/seed-categories";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const created = await seedDefaultCategories(drizzle(client));
  console.log(created > 0 ? `Categorías por defecto creadas: ${created}` : "Ya hay categorías: no se crea ninguna");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
