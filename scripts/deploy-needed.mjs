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
  /\.test\.ts$/, // pruebas unitarias y de integración
  /^docker\//,
  /^scripts\/(?!seed\.ts$)/, // herramientas de desarrollo (seed.ts sí corre en el despliegue)
  /^(eslint\.config\.mjs|vitest\.config\.mts|docker-compose\.yml|\.env\.example|\.gitignore)$/,
  /^LICENSE$/,
];

/** @param {string[]} files */
export function filesRequiringDeploy(files) {
  return files
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((file) => !SKIP_PATTERNS.some((re) => re.test(file)));
}

function main() {
  const files = readFileSync(0, "utf8").split("\n").filter((f) => f.trim());
  const relevant = filesRequiringDeploy(files);
  // Sin lista de archivos no hay forma de saber qué cambió: se despliega.
  const deploy = files.length === 0 || relevant.length > 0;

  if (files.length === 0) {
    console.log("No se recibió la lista de archivos cambiados: se despliega por seguridad.");
  } else if (deploy) {
    console.log(`Se despliega. Archivos que afectan la app (${relevant.length}):`);
    for (const f of relevant) console.log(`  • ${f}`);
  } else {
    console.log(`No se despliega: los ${files.length} archivos cambiados no afectan la app.`);
    for (const f of files) console.log(`  · ${f}`);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
