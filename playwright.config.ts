// Pruebas E2E con Playwright: un navegador real contra un build de producción local de la app,
// con su propia base de datos (finanzas_e2e_test). No llaman a Claude ni a WhatsApp reales: usan
// servidores falsos (e2e/fake-services.mjs).
//
// Uso: pnpm test:e2e   (compila la app; con E2E_SKIP_BUILD=1 reutiliza el último build)
import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2e/database-url";
import { E2E_CRON_SECRET, E2E_WHATSAPP_APP_SECRET, FAKE_SERVICES_URL } from "./e2e/fake-config";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const CI = Boolean(process.env.CI);
/** Las pruebas que cambian la configuración global (proyecto "configuracion"). */
const GLOBAL_SETTINGS = /configuracion-[\w-]+\.spec\.ts$/;

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
    { name: "escritorio", use: { ...devices["Desktop Chrome"] }, grepInvert: /@tactil/, testIgnore: GLOBAL_SETTINGS },
    // En celular, el flujo principal (@principal) y lo que solo importa en pantallas táctiles (@tactil).
    { name: "celular", use: { ...devices["Pixel 7"] }, grep: /@principal|@tactil/, testIgnore: GLOBAL_SETTINGS },
    // En tableta, solo lo táctil. Un iPad Air vertical en Chromium (el CI no instala WebKit), con el
    // navegador de computador: Safari del iPad se presenta como una Mac.
    {
      name: "tableta",
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      grep: /@tactil/,
      testIgnore: GLOBAL_SETTINGS,
    },
    // Lo que cambia la configuración de toda la app (pausar Claude, los topes del bot): si corriera a
    // la vez que las demás, sus mensajes recibirían "Claude está en pausa". En local va después de
    // todas; en el CI, en su propia parte, con su propia base (--no-deps).
    {
      name: "configuracion",
      use: { ...devices["Desktop Chrome"] },
      testMatch: GLOBAL_SETTINGS,
      dependencies: ["escritorio", "celular", "tableta"],
    },
  ],
  webServer: [
    {
      command: "node e2e/fake-services.mjs",
      url: `${FAKE_SERVICES_URL}/salud`,
      reuseExistingServer: !CI,
    },
    {
      command: process.env.E2E_SKIP_BUILD
        ? `pnpm exec next start -p ${PORT}`
        : `pnpm exec next build && pnpm exec next start -p ${PORT}`,
      url: `${BASE_URL}/login`,
      reuseExistingServer: !CI,
      timeout: 240_000,
      // Todo lo externo apunta a los servidores falsos, y las credenciales son de mentira: aunque
      // el .env local tenga las reales, estas tienen prioridad.
      env: {
        DATABASE_URL: e2eDatabaseUrl(),
        BETTER_AUTH_SECRET: "e2e-secreto-solo-para-pruebas-no-usar-en-produccion",
        BETTER_AUTH_URL: BASE_URL,
        WHATSAPP_API_URL: `${FAKE_SERVICES_URL}/graph`,
        WHATSAPP_ACCESS_TOKEN: "e2e-token-falso",
        WHATSAPP_PHONE_NUMBER_ID: "e2e-phone-id",
        WHATSAPP_APP_SECRET: E2E_WHATSAPP_APP_SECRET,
        WHATSAPP_VERIFY_TOKEN: "e2e-verify-token",
        WHATSAPP_DISPLAY_NUMBER: "573000000000",
        CRON_SECRET: E2E_CRON_SECRET,
        ANTHROPIC_BASE_URL: `${FAKE_SERVICES_URL}/anthropic`,
        ANTHROPIC_API_KEY: "e2e-key-falsa",
        ANTHROPIC_AUTH_TOKEN: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
