#!/usr/bin/env node
// Decide si los archivos que cambia un PR necesitan las pruebas E2E (el job e2e-parte del CI).
// Seguro por defecto: solo se saltan si TODOS los archivos están en la lista de abajo (cosas que
// las E2E no ejercitan). Cualquier archivo nuevo o desconocido las corre.
//
// Cada archivo que se salta aquí también se salta en scripts/deploy-needed.mjs (una prueba lo exige):
// nunca se despliega algo que las E2E no probaron. En main las E2E corren siempre.
//
// Uso: git diff --name-only <base> <pr> | node scripts/e2e-needed.mjs
// Escribe "e2e=true|false" en $GITHUB_OUTPUT si existe, y explica la decisión en stdout.

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Archivos que las E2E no ejercitan. */
export const E2E_SKIP_PATTERNS = [
  /\.md$/, // documentación (README, CLAUDE.md, AGENTS.md, plantillas)
  /^\.claude\//, // skills de Claude Code (el recorrido de diseño corre aparte, a pedido)
  /^\.githooks\//,
  /^\.zap\//, // reglas del escaneo de seguridad (ZAP), que es otro job
  /^\.github\/(?!workflows\/ci\.yml$)/, // otros workflows y el CLI de Vercel (ci.yml sí: es el que corre las E2E)
  // Pruebas unitarias, de integración y de componentes. En e2e/ no: Playwright también corre los
  // *.test.ts de ahí, así que una E2E nueva con ese nombre se saltaría en el PR.
  /^(?!e2e\/).*\.test\.tsx?$/,
  /^test\/integration\//, // infraestructura de las pruebas de integración
  // Herramientas de desarrollo. Las E2E sí usan admin.ts y db-cli.ts (pnpm admin:grant), y seed.ts
  // corre en el despliegue.
  /^scripts\/(?!(admin|db-cli|seed)\.ts$)/,
  /^(eslint\.config\.mjs|vitest(\.mutation)?\.config\.mts|stryker\.config\.mjs|docker-compose\.yml|\.env\.example|\.gitignore)$/,
  /^docker\//,
  /^LICENSE$/,
];

/** @param {string[]} files */
export function filesRequiringE2E(files) {
  return files
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((file) => !E2E_SKIP_PATTERNS.some((re) => re.test(file)));
}

/**
 * Decide desde la línea de comandos: recibe la salida de `git diff --name-only`, explica la
 * decisión y la escribe en GITHUB_OUTPUT. Devuelve true si hay que correr las E2E.
 *
 * @param {string} input
 * @param {{
 *   log?: (line: string) => void,
 *   outputFile?: string,
 *   append?: (file: string, text: string) => void,
 * }} [options]
 * @returns {boolean}
 */
export function runCli(
  input,
  { log = console.log, outputFile = process.env.GITHUB_OUTPUT, append = appendFileSync } = {},
) {
  const files = input.split("\n").filter((f) => f.trim());
  const relevant = filesRequiringE2E(files);
  // Sin lista de archivos no hay forma de saber qué cambió: corren.
  const e2e = files.length === 0 || relevant.length > 0;

  if (files.length === 0) {
    log("No se recibió la lista de archivos cambiados: las E2E corren por seguridad.");
  } else if (e2e) {
    log(`Las E2E corren. Archivos que ejercitan (${relevant.length}):`);
    for (const f of relevant) log(`  • ${f}`);
  } else {
    log(`Se saltan las E2E: no ejercitan ninguno de los ${files.length} archivos cambiados.`);
    for (const f of files) log(`  · ${f}`);
  }
  if (outputFile) append(outputFile, `e2e=${e2e}\n`);
  return e2e;
}

// Stryker disable next-line all: punto de entrada de la línea de comandos; se prueba con la función exportada y lo ejercita el CI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runCli(readFileSync(0, "utf8"));
