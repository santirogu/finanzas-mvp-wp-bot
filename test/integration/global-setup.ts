// Prepara la base de datos de pruebas una vez por corrida (ver test/reset-database.ts).
import "dotenv/config";
import { resetTestDatabase } from "../reset-database";

export default async function setup() {
  await resetTestDatabase(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
}
