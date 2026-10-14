import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Falta la variable de entorno DATABASE_URL");
}

// Reutiliza la conexión entre recargas en desarrollo para no agotar el pool.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

const client =
  globalForDb.pgClient ??
  postgres(connectionString, {
    // En serverless conviene un pool pequeño; el pooler de Supabase/Neon hace el resto.
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    // Necesario con poolers en modo transacción (Supabase :6543, Neon -pooler).
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
