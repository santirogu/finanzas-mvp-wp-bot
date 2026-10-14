import { describe, expect, it } from "vitest";
import { checkHealth, LATEST_MIGRATION } from "@/lib/health";
import { latestAppliedMigration } from "./migrations-status";

// La base de pruebas tiene todas las migraciones (las aplica test/integration/global-setup.ts
// con el mismo migrador que drizzle-kit migrate usa en el despliegue).
describe("latestAppliedMigration", () => {
  it("devuelve el `when` de la última migración del journal", async () => {
    expect(await latestAppliedMigration()).toBe(LATEST_MIGRATION);
  });

  it("con la base real, checkHealth da la base por al día", async () => {
    const result = await checkHealth({ env: () => "valor", latestAppliedMigration });
    expect(result).toEqual({ ok: true });
  });
});
