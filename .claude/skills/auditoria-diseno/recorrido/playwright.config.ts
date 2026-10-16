// El recorrido de la auditoría de diseño: usa lo mismo que las E2E (el build local, la base
// finanzas_e2e_test, que se borra al empezar, y los servidores falsos de WhatsApp y Claude), así que
// no corre a la vez que `pnpm test:e2e`. Uso y filtros: recorrido.spec.ts.
import path from "node:path";
import { defineConfig } from "@playwright/test";
import base from "../../../../playwright.config";

const RAIZ = path.resolve(__dirname, "../../../..");
const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
process.env.AUDITORIA_SALIDA ??= path.join(RAIZ, "reports/diseno", `${hoy}-recorrido`);

export default defineConfig({
  ...base,
  testDir: __dirname,
  testMatch: "recorrido.spec.ts",
  globalSetup: path.join(RAIZ, "e2e/global-setup.ts"),
  globalTeardown: path.join(__dirname, "galeria.ts"),
  fullyParallel: true,
  retries: 0,
  workers: 4,
  reporter: [["line"]],
  outputDir: path.join(RAIZ, "test-results/auditoria-diseno"),
  use: { ...base.use, trace: "off", screenshot: "off", video: "off" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    // El motor de Safari (iPhone, iPad y Mac). Se instala con `pnpm exec playwright install webkit`.
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: [base.webServer ?? []].flat().map((server) => ({ ...server, cwd: RAIZ })),
});
