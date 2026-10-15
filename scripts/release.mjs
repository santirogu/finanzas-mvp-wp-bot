#!/usr/bin/env node
// Prepara la release de GitHub de cada despliegue a producción: calcula la versión siguiente con
// los commits desde la última release (Conventional Commits) y arma las notas en español,
// agrupadas por tipo. Lo corre el job "Publicar release" del CI, solo si el despliegue salió bien.
//
//   feat → sube la versión menor (1.2.0 → 1.3.0)   ·   "!" (cambio incompatible) → la mayor
//   cualquier otro cambio → el parche (1.2.0 → 1.2.1)   ·   la primera release es la 1.0.0
//
// Uso: node scripts/release.mjs --notes <archivo>
// Escribe en GITHUB_OUTPUT: release=true|false, version=1.2.0, tag=v1.2.0
// Sin dependencias: corre en el CI sin instalar paquetes.

import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseHeader } from "./conventional-commit.mjs";

export const FIRST_VERSION = "1.0.0";

/** Secciones de las notas, en orden. Cada commit va en la primera que le corresponde. */
export const SECTIONS = [
  { title: "⚠️ Cambios incompatibles", includes: (c) => c.breaking },
  { title: "✨ Funcionalidades", includes: (c) => c.type === "feat" },
  { title: "🐛 Correcciones", includes: (c) => c.type === "fix" },
  { title: "⚡ Rendimiento", includes: (c) => c.type === "perf" },
  { title: "🧰 Mantenimiento", includes: (c) => c.type !== null },
  // Los primeros commits del proyecto, de antes de usar Conventional Commits.
  { title: "📦 Otros cambios", includes: () => true },
];

/**
 * Un commit de main ("feat(auth): bloquear la cuenta (#31)") en sus partes. El número de PR lo
 * agrega GitHub al fusionar con squash.
 */
export function parseCommit(subject) {
  const trimmed = subject.trim();
  const pr = trimmed.match(/ \(#(\d+)\)$/)?.[1] ?? null;
  const header = pr ? trimmed.slice(0, trimmed.lastIndexOf(" (#")) : trimmed;
  const parsed = parseHeader(header);
  if (!parsed) return { type: null, scope: null, breaking: false, description: header, pr };
  return { ...parsed, pr };
}

/** Versión siguiente según el tipo de cambio más importante desde la anterior. */
export function nextVersion(previous, commits) {
  if (!previous) return FIRST_VERSION;
  const [major, minor, patch] = previous.split(".").map(Number);
  if (commits.some((c) => c.breaking)) return `${major + 1}.0.0`;
  if (commits.some((c) => c.type === "feat")) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Una línea de las notas. En las secciones sin un tipo único, sin ámbito se muestra el tipo. */
function line(c, { showType }) {
  const label = c.scope ?? (showType ? c.type : null);
  return `- ${label ? `**${label}:** ` : ""}${c.description}${c.pr ? ` (#${c.pr})` : ""}`;
}

/**
 * Notas de la release en markdown, agrupadas por sección.
 * @param {{
 *   version: string,
 *   previousTag: string | null,
 *   commits: ReturnType<typeof parseCommit>[],
 *   repository?: string,
 * }} release
 */
export function releaseNotes({ version, previousTag, commits, repository }) {
  const parts = [];
  if (!previousTag) {
    parts.push("Primera versión publicada: todo lo que tiene la app hasta hoy.");
  }
  const remaining = [...commits];
  for (const section of SECTIONS) {
    const items = remaining.filter(section.includes);
    if (items.length === 0) continue;
    for (const item of items) remaining.splice(remaining.indexOf(item), 1);
    const showType = section.title === "🧰 Mantenimiento";
    parts.push(`### ${section.title}\n\n${items.map((c) => line(c, { showType })).join("\n")}`);
  }
  if (previousTag && repository) {
    parts.push(`**Cambios completos:** https://github.com/${repository}/compare/${previousTag}...v${version}`);
  }
  return `${parts.join("\n\n")}\n`;
}

/** git en el directorio actual; devuelve la salida sin espacios al final. */
function defaultGit(args) {
  // stderr se captura: "no hay tags" es esperable la primera vez y no debe ensuciar el log.
  // Stryker disable next-line ArrayDeclaration,StringLiteral: solo cambia lo que se imprime en el log.
  const stdio = ["ignore", "pipe", "pipe"];
  return execFileSync("git", args, { encoding: "utf8", stdio }).trim();
}

/**
 * Calcula la release desde la línea de comandos y devuelve el código de salida.
 * git, los archivos y la salida se reciben como parámetros para poder probarlo.
 *
 * @param {string[]} argv
 * @param {{
 *   git?: (args: string[]) => string,
 *   writeFile?: (file: string, text: string) => void,
 *   append?: (file: string, text: string) => void,
 *   outputFile?: string,
 *   repository?: string,
 *   log?: (line: string) => void,
 *   error?: (line: string) => void,
 * }} [options]
 */
export function runCli(
  argv,
  {
    git = defaultGit,
    writeFile = writeFileSync,
    append = appendFileSync,
    outputFile = process.env.GITHUB_OUTPUT,
    repository = process.env.GITHUB_REPOSITORY,
    log = console.log,
    error = console.error,
  } = {},
) {
  const notesIndex = argv.indexOf("--notes");
  const notesFile = notesIndex >= 0 ? argv[notesIndex + 1] : undefined;
  if (!notesFile) {
    error("Uso: node scripts/release.mjs --notes <archivo>");
    return 2;
  }
  const output = (key, value) => {
    if (outputFile) append(outputFile, `${key}=${value}\n`);
  };

  let previousTag = null;
  try {
    previousTag = git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*"]) || null;
  } catch {
    // Sin tags todavía: esta será la primera release.
  }
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
  const subjects = git(["log", "--format=%s", range]).split("\n").filter((s) => s.trim());
  if (previousTag && subjects.length === 0) {
    log(`Sin cambios desde ${previousTag}: no se crea una release.`);
    output("release", "false");
    return 0;
  }

  const commits = subjects.map(parseCommit);
  const version = nextVersion(previousTag?.slice(1) ?? null, commits);
  writeFile(notesFile, releaseNotes({ version, previousTag, commits, repository }));
  log(`Release v${version}${previousTag ? ` (antes ${previousTag})` : ""}: ${commits.length} cambios.`);
  output("release", "true");
  output("version", version);
  output("tag", `v${version}`);
  return 0;
}

// Stryker disable next-line all: punto de entrada de la línea de comandos; se prueba con la función exportada y lo ejercita el CI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(runCli(process.argv.slice(2)));
