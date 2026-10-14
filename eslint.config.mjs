import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reporte HTML de cobertura generado por Vitest.
    "coverage/**",
    // Reporte y sandbox del mutation testing (Stryker).
    "reports/**",
    // Reportes y trazas de las pruebas E2E (Playwright).
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    ".stryker-tmp/**",
  ]),
]);

export default eslintConfig;
