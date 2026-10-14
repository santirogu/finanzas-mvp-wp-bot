// Inserta las categorías globales por defecto. Es idempotente: se puede correr varias veces.
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { category } from "../src/db/schema";

const EXPENSE = [
  ["Alimentación", "🍽️"],
  ["Mercado", "🛒"],
  ["Transporte", "🚌"],
  ["Vivienda", "🏠"],
  ["Servicios", "💡"],
  ["Salud", "🩺"],
  ["Ropa", "👟"],
  ["Entretenimiento", "🎬"],
  ["Educación", "📚"],
  ["Deudas", "💳"],
  ["Otros", "📦"],
] as const;

const INCOME = [
  ["Salario", "💼"],
  ["Freelance", "💻"],
  ["Ventas", "🏷️"],
  ["Inversiones", "📈"],
  ["Regalos", "🎁"],
  ["Otros", "📦"],
] as const;

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const db = drizzle(client);

  const rows = [
    ...EXPENSE.map(([name, emoji]) => ({ type: "expense" as const, name, emoji })),
    ...INCOME.map(([name, emoji]) => ({ type: "income" as const, name, emoji })),
  ];
  const inserted = await db.insert(category).values(rows).onConflictDoNothing().returning();
  console.log(`Categorías nuevas: ${inserted.length} (de ${rows.length})`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
