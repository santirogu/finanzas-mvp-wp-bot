// Base exclusiva de las pruebas E2E (nunca la de desarrollo ni la de integración): por defecto,
// el mismo servidor de TEST_DATABASE_URL con la base "finanzas_e2e_test".
export function e2eDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.E2E_DATABASE_URL) return env.E2E_DATABASE_URL;
  const url = new URL(
    env.TEST_DATABASE_URL ?? "postgres://finanzas:finanzas@localhost:5432/finanzas_test",
  );
  url.pathname = "/finanzas_e2e_test";
  return url.toString();
}
