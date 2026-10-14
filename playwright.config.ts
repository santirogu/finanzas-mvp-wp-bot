// Pruebas E2E con Playwright: un navegador real contra un build de producción local de la app,
// con su propia base de datos (finanzas_e2e_test). No llaman a Claude ni a WhatsApp.
//
// Uso: pnpm test:e2e   (compila la app; con E2E_SKIP_BUILD=1 reutiliza el último build)
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2e/database-url";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: CI,
  // Un reintento en el CI: si una prueba pasa al segundo intento, el reporte la marca "flaky".
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    // En celular solo el flujo principal (las pruebas marcadas con @principal).
    { name: "celular", use: { ...devices["Pixel 7"] }, grep: /@principal/ },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? `pnpm exec next start -p ${PORT}`
      : `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !CI,
    timeout: 240_000,
    env: {
      DATABASE_URL: e2eDatabaseUrl(),
      BETTER_AUTH_SECRET: "e2e-secreto-solo-para-pruebas-no-usar-en-produccion",
      BETTER_AUTH_URL: BASE_URL,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
