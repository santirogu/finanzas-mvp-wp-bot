#!/usr/bin/env node
// Resume los reportes JSON de Stryker (reports/mutation/mutation.json) en una tabla Markdown:
// puntaje total y por archivo, ordenado de peor a mejor. Lo usa el CI para el resumen de la corrida:
// con varias partes en paralelo (scripts/mutation-targets.mjs), junta sus reportes en uno.
//
// Uso: node scripts/mutation-summary.mjs [reporte.json ...]   (por defecto, reports/mutation/mutation.json)

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DETECTED = new Set(["Killed", "Timeout"]);
const UNDETECTED = new Set(["Survived", "NoCoverage"]);

/** Puntaje como lo calcula Stryker: detectados / (detectados + no detectados). */
export function score(mutants) {
  const detected = mutants.filter((m) => DETECTED.has(m.status)).length;
  const undetected = mutants.filter((m) => UNDETECTED.has(m.status)).length;
  const valid = detected + undetected;
  return { detected, undetected, valid, percent: valid ? (detected / valid) * 100 : 100 };
}

/** @param {{ files: Record<string, { mutants: { status: string }[] }> }} report */
export function summarize(report) {
  const files = Object.entries(report.files).map(([file, { mutants }]) => ({
    file,
    ...score(mutants),
  }));
  const total = score(Object.values(report.files).flatMap((f) => f.mutants));
  files.sort((a, b) => a.percent - b.percent || b.undetected - a.undetected);

  const pct = (n) => `${n.toFixed(1)} %`;
  return [
    `### Mutation testing: ${pct(total.percent)}`,
    "",
    `${total.detected} de ${total.valid} mutantes detectados por las pruebas; ${total.undetected} sobrevivieron.`,
    "",
    "| Archivo | Puntaje | Sobrevivientes |",
    "|---|---|---|",
    ...files.map((f) => `| \`${f.file}\` | ${pct(f.percent)} | ${f.undetected} |`),
    "",
    "El reporte HTML completo (cada mutante sobreviviente en su línea) está en los artifacts `mutation-report-*` de la corrida.",
  ].join("\n");
}

const DEFAULT_REPORT = "reports/mutation/mutation.json";

/**
 * Imprime el resumen (de uno o varios reportes, juntos) y lo agrega al resumen de la corrida de GitHub
 * (GITHUB_STEP_SUMMARY).
 *
 * @param {string | string[]} [paths]
 * @param {{
 *   exists?: (path: string) => boolean,
 *   read?: (path: string) => string,
 *   log?: (line: string) => void,
 *   summaryFile?: string,
 *   append?: (file: string, text: string) => void,
 * }} [options]
 */
export function runCli(
  paths = DEFAULT_REPORT,
  {
    exists = existsSync,
    // Stryker disable next-line StringLiteral: sin "utf8" llega un Buffer y JSON.parse lo lee igual
    read = (file) => readFileSync(file, "utf8"),
    log = console.log,
    summaryFile = process.env.GITHUB_STEP_SUMMARY,
    append = appendFileSync,
  } = {},
) {
  const found = [];
  for (const path of [paths].flat()) {
    if (exists(path)) found.push(path);
    else log(`No existe ${path}: Stryker no generó reporte.`);
  }
  if (found.length === 0) return;
  // Cada parte mutó otros archivos: sus reportes se juntan sin pisarse.
  const files = Object.assign({}, ...found.map((path) => JSON.parse(read(path)).files));
  const markdown = summarize({ files });
  log(markdown);
  if (summaryFile) append(summaryFile, `${markdown}\n`);
}

// Stryker disable next-line all: punto de entrada de la línea de comandos; se prueba con la función exportada y lo ejercita el CI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) runCli(process.argv.length > 2 ? process.argv.slice(2) : undefined);
