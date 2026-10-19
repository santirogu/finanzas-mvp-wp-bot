#!/usr/bin/env node
// Qué archivos muta Stryker en cada corrida del CI (.github/workflows/mutation.yml) y en cuántas partes
// en paralelo. Cada mutante corre la suite unitaria completa (el runner por comando): la lista entera de
// stryker.config.mjs son ~5000 mutantes, unas 8 horas en un runner de GitHub, más de lo que dura un job.
//   · En un PR, solo los archivos de esa lista que el PR cambió: unos minutos.
//   · Los lunes y a mano, la lista completa, en partes de unos 45 minutos que corren a la vez.
//
// Uso:
//   git diff --name-only <base> <pr> | node scripts/mutation-targets.mjs cambios
//   node scripts/mutation-targets.mjs todos
//   node scripts/mutation-targets.mjs local     (pnpm test:mutation:cambios: lo que cambió frente a origin/main)
// En el CI escribe en $GITHUB_OUTPUT `count` (cuántos archivos) y `matrix` (las partes, en JSON).

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, globSync, readFileSync, statSync } from "node:fs";
import { matchesGlob } from "node:path";
import { pathToFileURL } from "node:url";
import config from "../stryker.config.mjs";

/**
 * Cuánto código entra en una parte, en bytes: en este repo, cada mutante sale de unos 49 bytes y GitHub
 * prueba unos 10 por minuto, así que son ~490 mutantes, unos 45 minutos.
 */
export const SHARD_BYTES = 24_000;
/** Como mucho, tantas partes a la vez: GitHub da 20 jobs simultáneos a un repo público (quedan para el resto del CI). */
export const MAX_SHARDS = 12;

/** ¿Stryker muta ese archivo? (Está en la lista `mutate` de stryker.config.mjs.) */
export const isTarget = (file, patterns = config.mutate) => patterns.some((pattern) => matchesGlob(file, pattern));

/**
 * Los archivos cambiados que Stryker muta, sin repetir y en orden. Los borrados no: ya no hay qué mutar.
 *
 * @param {string[]} changed
 * @param {{ patterns?: string[], exists?: (file: string) => boolean }} [options]
 */
export function changedTargets(changed, { patterns = config.mutate, exists = existsSync } = {}) {
  // Una línea vacía nunca está en la lista: no hace falta quitarla aparte.
  const files = new Set(changed.map((file) => file.trim()));
  return [...files].filter((file) => isTarget(file, patterns) && exists(file)).sort();
}

/**
 * Todos los archivos de la lista `mutate`, sin repetir y en orden.
 *
 * @param {{ patterns?: string[], glob?: (pattern: string) => string[] }} [options]
 */
export function allTargets({ patterns = config.mutate, glob = (pattern) => globSync(pattern) } = {}) {
  return [...new Set(patterns.flatMap((pattern) => glob(pattern)))].sort();
}

/**
 * Reparte los archivos en partes parejas por tamaño (los mutantes salen del código): cada archivo, del más
 * grande al más chico, va a la parte con menos código. Tantas partes como hagan falta para que ninguna pase
 * de `shardBytes` (más o menos), hasta `maxShards`.
 *
 * @param {string[]} files
 * @param {{ size?: (file: string) => number, shardBytes?: number, maxShards?: number }} [options]
 * @returns {{ parte: string, files: string }[]} `files`, separados por comas (lo que recibe `stryker run --mutate`).
 */
export function shard(files, { size = (file) => statSync(file).size, shardBytes = SHARD_BYTES, maxShards = MAX_SHARDS } = {}) {
  const sized = files.map((file) => ({ file, bytes: size(file) }));
  const total = sized.reduce((sum, { bytes }) => sum + bytes, 0);
  // Con archivos, al menos una parte (aunque estén vacíos); sin archivos, ninguna (el mínimo es 0).
  const count = Math.min(maxShards, files.length, Math.max(1, Math.ceil(total / shardBytes)));
  const parts = Array.from({ length: count }, () => ({ files: /** @type {string[]} */ ([]), bytes: 0 }));
  sized.sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file));
  for (const { file, bytes } of sized) {
    const lightest = parts.reduce((min, part) => (part.bytes < min.bytes ? part : min));
    lightest.files.push(file);
    lightest.bytes += bytes;
  }
  return parts.map((part, i) => ({ parte: `${i + 1} de ${count}`, files: part.files.sort().join(",") }));
}

/**
 * El paso del CI: decide qué se muta (`cambios`: lo del PR, de `input`; `todos`: la lista completa), lo
 * explica y escribe `count` y `matrix` en GITHUB_OUTPUT.
 *
 * @param {"cambios" | "todos"} mode
 * @param {string} input la salida de `git diff --name-only` (solo en `cambios`)
 * @param {{
 *   log?: (line: string) => void,
 *   outputFile?: string,
 *   append?: (file: string, text: string) => void,
 *   patterns?: string[],
 *   exists?: (file: string) => boolean,
 *   glob?: (pattern: string) => string[],
 *   size?: (file: string) => number,
 * }} [options]
 */
export function runCli(mode, input, { log = console.log, outputFile = process.env.GITHUB_OUTPUT, append = appendFileSync, ...deps } = {}) {
  const files = mode === "todos" ? allTargets(deps) : changedTargets(input.split("\n"), deps);
  const parts = shard(files, deps);
  if (files.length === 0) {
    log("El PR no cambia ningún archivo de la lista de stryker.config.mjs: no hay nada que mutar.");
  } else {
    const what = mode === "todos" ? "La lista completa de stryker.config.mjs" : "Los archivos del PR que muta Stryker";
    log(`${what} (${files.length}), en ${parts.length} ${parts.length === 1 ? "parte" : "partes"}:`);
    for (const part of parts) log(`  • Parte ${part.parte}: ${part.files.split(",").join(", ")}`);
  }
  if (outputFile) append(outputFile, `count=${files.length}\nmatrix=${JSON.stringify(parts)}\n`);
  return parts;
}

/** Lo que imprime git con esos argumentos. */
export const gitOutput = (args) => execFileSync("git", args, { encoding: "utf8" });

/**
 * Corre Stryker sobre esos archivos (separados por comas), con su salida en la terminal. Devuelve su código
 * de salida (1 si no llegó a terminar).
 *
 * @param {string} files
 * @param {typeof spawnSync} [spawn]
 */
export function runStryker(files, spawn = spawnSync) {
  return spawn("pnpm", ["exec", "stryker", "run", "--mutate", files], { stdio: "inherit" }).status ?? 1;
}

/**
 * `pnpm test:mutation:cambios`: en tu máquina, muta solo los archivos de la lista que cambiaste frente a
 * origin/main (con lo que todavía no está en un commit). Devuelve el código de salida de Stryker.
 *
 * @param {{
 *   git?: (args: string[]) => string,
 *   run?: (files: string) => number,
 *   log?: (line: string) => void,
 *   patterns?: string[],
 *   exists?: (file: string) => boolean,
 * }} [options]
 */
export function runLocal({ git = gitOutput, run = runStryker, log = console.log, ...deps } = {}) {
  const changed = [
    git(["diff", "--name-only", "origin/main...HEAD"]),
    git(["diff", "--name-only", "HEAD"]),
    git(["ls-files", "--others", "--exclude-standard"]),
  ].join("\n");
  const files = changedTargets(changed.split("\n"), deps);
  if (files.length === 0) {
    log("No cambiaste ningún archivo de la lista de stryker.config.mjs frente a origin/main: no hay nada que mutar.");
    return 0;
  }
  log(`Stryker muta ${files.length} ${files.length === 1 ? "archivo" : "archivos"}: ${files.join(", ")}`);
  return run(files.join(","));
}

// Stryker disable all: punto de entrada de la línea de comandos; se prueba con las funciones exportadas y lo ejercita el CI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  if (mode === "local") process.exitCode = runLocal();
  else if (mode === "cambios") runCli(mode, readFileSync(0, "utf8"));
  else if (mode === "todos") runCli(mode, "");
  else {
    console.error("Uso: node scripts/mutation-targets.mjs cambios | todos | local");
    process.exitCode = 2;
  }
}
