// Mutation testing con StrykerJS (ver README → Pruebas y CI).
//
// Se usa el runner genérico "command" y no @stryker-mutator/vitest-runner: ese plugin (10.0.0)
// todavía no soporta Vitest 5 y deja los mutantes sin activar (todo "sobrevive"). El runner por
// comando activa cada mutante con la variable __STRYKER_ACTIVE_MUTANT__ y corre la suite unitaria
// completa: es más lento, pero no depende de las partes internas de Vitest.

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  testRunner: "command",
  commandRunner: { command: "npx vitest run --config vitest.mutation.config.mts --reporter=dot" },
  coverageAnalysis: "off",
  // Lógica cubierta por pruebas unitarias. Lo que depende de la base de datos (consultas,
  // vinculación, flujo del bot) se prueba en integración y queda fuera por ahora. Los componentes
  // (*.tsx) tampoco se mutan: casi todo su código son clases de Tailwind y textos, y su
  // comportamiento lo cubren las pruebas de componentes y las E2E.
  mutate: [
    "src/lib/{money,dates,month-nav,toasts,suggestions,email-typo,env,app-url,session,health,auth-errors,security-headers,service-url,roles,expired-session,field-errors,safe-log,text,cron-auth}.ts",
    "src/modules/auth/{two-factor-rules,http-routes,account-name}.ts",
    "src/modules/account/password-change.ts",
    "src/modules/admin/{modules,history/log-filters,shared/filters,shared/totp,users/user-filters,users/session-info,categories/category-input,bot/bot-filters}.ts",
    "src/modules/bot/{commands,normalize,interpret,replies,prompt,claude-extractor,limits,pricing}.ts",
    "src/modules/whatsapp/{signature,payload,phone,client,actions}.ts",
    "src/modules/transactions/{validation,default-categories,month-comparison,category-chart,search}.ts",
    "src/modules/reports/{period,summary,categories,recurring}.ts",
    "src/app/api/{whatsapp/webhook,health}/route.ts",
    "src/app/*/simulador/actions.ts",
    "src/proxy.ts",
    "scripts/{conventional-commit,deploy-needed,e2e-needed,pr-description,check-schema-drift,mutation-summary,mutation-targets,smoke,release}.mjs",
    "scripts/{delete-data,admin,db-cli,db-backup}.ts",
  ],
  reporters: ["clear-text", "progress-append-only", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: "always",
  timeoutMS: 15000,
  // break: la corrida falla por debajo (no bloquea el merge). Puntaje al agregarlo: 76,8 %; tras
  // cubrir los mutantes sobrevivientes: ~95 % (lo que queda son mutantes equivalentes).
  thresholds: { high: 95, low: 90, break: 90 },
};

export default config;
