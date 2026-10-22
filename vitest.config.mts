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
        // Las descargas de Reportes (CSV y PDF): rutas fuera de src/app/api, probadas en integración.
        "src/app/**/reportes/*/route.ts",
        "src/proxy.ts",
        "src/i18n/**",
        "src/app/{robots,sitemap}.ts",
        "src/components/**",
        // Los componentes de src/app con su prueba. test/cobertura.test.ts falla si un componente de cliente
        // ("use client") no está aquí ni excluido a propósito.
        "src/app/**/{auth-form,two-factor-login,two-factor-setup,expired-session-notice,filter-bar,chip-filter-bar,admin-nav,nav-tabs,whatsapp-connect,page-skeleton,delete-account-form,change-password,user-menu,account-actions,event-item,admin-dialog,category-manager,category-chart,account-menu,month-nav,daily-spending,download-menu,fixed-expenses,trend-chart,upcoming-payments,notification-settings,notification-bell,user-notifications,bot-settings,connections,resend-replies,theme-picker,language-picker,unlink-whatsapp,whatsapp-hint,not-found-content,budgets}.tsx",
        "scripts/*.mjs",
        "scripts/{delete-data,admin,db-cli,db-backup}.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "src/modules/bot/eval/**",
        // La fuente del PDF (archivos .ttf y su licencia): no es código.
        "src/modules/reports/pdf/fonts/**",
        "src/lib/auth-client.ts",
        // El chat del simulador del bot solo existe en desarrollo (en producción la página da 404).
        "src/app/[lang]/(app)/simulador/chat.tsx",
      ],
      reporter: ["text", "json-summary", "html"],
      // Piso: el CI falla si la cobertura baja de aquí. Unos 2 a 3 puntos por debajo de la real (el
      // 2026-10-20: líneas 97,7 %, ramas 96,7 %, funciones 95,7 %), así una baja grande (las pruebas de
      // un módulo entero que se borran) hace fallar el CI. Súbelo cuando la real suba.
      thresholds: { lines: 95, statements: 95, functions: 93, branches: 94 },
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts", "test/**/*.test.ts"],
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
