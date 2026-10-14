#!/usr/bin/env node
// Decide si un conjunto de archivos cambiados requiere desplegar a producción.
// Seguro por defecto: solo se salta el despliegue si TODOS los archivos están en la lista de
// abajo (cosas que no afectan la app en ejecución). Cualquier archivo nuevo o desconocido despliega.
//
// Uso: git diff --name-only <desplegado> <nuevo> | node scripts/deploy-needed.mjs
// Escribe "deploy=true|false" en $GITHUB_OUTPUT si existe, y explica la decisión en stdout.

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Archivos que no cambian lo que corre en producción. */
export const SKIP_PATTERNS = [
  /\.md$/, // documentación (README, CLAUDE.md, AGENTS.md)
  /^\.github\//, // workflows de CI
  /^\.githooks\//,
  /^\.claude\//,
  /^test\//, // infraestructura de pruebas
  /^e2e\//, // pruebas E2E (Playwright)
  /\.test\.tsx?$/, // pruebas unitarias, de integración y de componentes
  /^docker\//,
  /^scripts\/(?!seed\.ts$)/, // herramientas de desarrollo (seed.ts sí corre en el despliegue)
  /^(eslint\.config\.mjs|vitest(\.mutation)?\.config\.mts|playwright\.config\.ts|stryker\.config\.mjs|docker-compose\.yml|\.env\.example|\.gitignore)$/,
  /^LICENSE$/,
];

/** @param {string[]} files */
export function filesRequiringDeploy(files) {
  return files
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((file) => !SKIP_PATTERNS.some((re) => re.test(file)));
}

/**
 * Decide desde la línea de comandos: recibe la salida de `git diff --name-only`, explica la
 * decisión y la escribe en GITHUB_OUTPUT. Devuelve true si hay que desplegar.
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
  const relevant = filesRequiringDeploy(files);
  // Sin lista de archivos no hay forma de saber qué cambió: se despliega.
  const deploy = files.length === 0 || relevant.length > 0;

  if (files.length === 0) {
    log("No se recibió la lista de archivos cambiados: se despliega por seguridad.");
  } else if (deploy) {
    log(`Se despliega. Archivos que afectan la app (${relevant.length}):`);
    for (const f of relevant) log(`  • ${f}`);
  } else {
    log(`No se despliega: los ${files.length} archivos cambiados no afectan la app.`);
    for (const f of files) log(`  · ${f}`);
  }
  if (outputFile) append(outputFile, `deploy=${deploy}\n`);
  return deploy;
}

// Stryker disable next-line all: punto de entrada de la línea de comandos; se prueba con la función exportada y lo ejercita el CI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runCli(readFileSync(0, "utf8"));
