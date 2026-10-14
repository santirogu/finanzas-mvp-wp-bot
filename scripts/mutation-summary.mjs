#!/usr/bin/env node
// Resume el reporte JSON de Stryker (reports/mutation/mutation.json) en una tabla Markdown:
// puntaje total y por archivo, ordenado de peor a mejor. Lo usa el CI para el resumen de la corrida.
//
// Uso: node scripts/mutation-summary.mjs [reports/mutation/mutation.json]

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
    "El reporte HTML completo (cada mutante sobreviviente en su línea) está en el artifact `mutation-report`.",
  ].join("\n");
}

function main(path = "reports/mutation/mutation.json") {
  if (!existsSync(path)) {
    console.log(`No existe ${path}: Stryker no generó reporte.`);
    return;
  }
  const markdown = summarize(JSON.parse(readFileSync(path, "utf8")));
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv[2]);
