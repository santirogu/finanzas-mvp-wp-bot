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
  // vinculación, flujo del bot) se prueba en integración y queda fuera por ahora.
  mutate: [
    "src/lib/{money,dates,email-typo,env,app-url,session,health}.ts",
    "src/modules/bot/{commands,normalize,interpret,replies,prompt,claude-extractor}.ts",
    "src/modules/whatsapp/{signature,payload,phone,client,actions}.ts",
    "src/modules/transactions/validation.ts",
    "src/app/api/{whatsapp/webhook,health}/route.ts",
    "scripts/{conventional-commit,deploy-needed,pr-description,check-schema-drift,mutation-summary,smoke}.mjs",
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
