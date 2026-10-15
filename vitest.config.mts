import "dotenv/config";
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
    coverage: {
      provider: "v8",
      // Lógica de negocio y servidor (incluidas las Server Actions y el proxy) y los componentes
      // de cliente. Las páginas (componentes de servidor) se prueban con las E2E.
      include: [
        "src/lib/**",
        "src/modules/**",
        "src/db/**",
        "src/app/api/**",
        "src/app/**/actions.ts",
        "src/proxy.ts",
        "src/app/robots.ts",
        "src/components/**",
        "src/app/**/{auth-form,nav-tabs,whatsapp-connect,page-skeleton,delete-account-form,user-menu}.tsx",
        "scripts/*.mjs",
        "scripts/{delete-data,admin,db-cli}.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "src/modules/bot/eval/**",
        "src/lib/auth-client.ts",
      ],
      reporter: ["text", "json-summary", "html"],
      // Piso actual: el CI falla si la cobertura baja. Súbelo a medida que agregues pruebas.
      thresholds: { lines: 85, statements: 85, functions: 80, branches: 80 },
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        // Componentes de React con React Testing Library, en un DOM simulado (jsdom).
        test: {
          name: "componentes",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["test/components-setup.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["test/integration/global-setup.ts"],
          setupFiles: ["test/integration/setup.ts"],
          // Todas las pruebas comparten la misma base: un archivo a la vez.
          fileParallelism: false,
          env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
