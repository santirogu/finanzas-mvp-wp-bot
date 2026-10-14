// Antes de las pruebas E2E: base vacía, migrada y con las categorías por defecto.
import "dotenv/config";
import { resetTestDatabase } from "../test/reset-database";
import { e2eDatabaseUrl } from "./database-url";

export default async function globalSetup() {
  await resetTestDatabase(e2eDatabaseUrl(), "E2E_DATABASE_URL");
}
