// Configuración de Vitest para el mutation testing (Stryker): solo las pruebas unitarias.
// Las de integración comparten una base de datos y Stryker corre en paralelo.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      "server-only": path("./test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // La matriz de autorización lee el código fuente, que Stryker reescribe para activar los
    // mutantes: ahí no reconoce las Server Actions. Corre igual en el CI normal (pnpm test).
    exclude: ["src/**/*.int.test.ts", "src/authorization-matrix.test.ts"],
  },
});
