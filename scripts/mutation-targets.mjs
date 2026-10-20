#!/usr/bin/env node
// Qué archivos muta Stryker en cada corrida del CI (.github/workflows/mutation.yml) y en cuántas partes
// en paralelo. Cada mutante corre la suite unitaria completa (el runner por comando): la lista entera de
// stryker.config.mjs son ~5000 mutantes, unas 8 horas en un runner de GitHub, más de lo que dura un job.
//   · En un PR, solo los archivos de esa lista que el PR cambió: unos minutos. Si el PR cambia la lista,
//     también los que entran a ella (si no, nada los mutaría hasta el lunes).
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

/** El archivo con la lista `mutate`. */
export const CONFIG_FILE = "stryker.config.mjs";

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
 * Los archivos que entran a la lista: los de `patterns` que no estaban con `before` (la lista de antes del
 * cambio), en orden. Los que ya estaban, solo si cambiaron (`changedTargets`).
 *
 * @param {string[]} before
 * @param {{ patterns?: string[], glob?: (pattern: string) => string[] }} [options]
 */
export function addedTargets(before, { patterns = config.mutate, glob } = {}) {
  const previous = new Set(allTargets({ patterns: before, glob }));
  return allTargets({ patterns, glob }).filter((file) => !previous.has(file));
}

/**
 * Lo que se muta por un cambio: los archivos de la lista que cambiaron y, si cambió la lista (`before`, la
 * de antes), los que entran a ella, sin repetir y en orden. `added` son estos últimos, para decirlo.
 *
 * @param {string[]} changed
 * @param {string[] | undefined} before
 * @param {{ patterns?: string[], exists?: (file: string) => boolean, glob?: (pattern: string) => string[] }} [deps]
 */
export function targetsFor(changed, before, deps = {}) {
  const added = before ? addedTargets(before, deps) : [];
  return { files: [...new Set([...changedTargets(changed, deps), ...added])].sort(), added };
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
 * El paso del CI: decide qué se muta (`cambios`: lo del PR, de `input`, y lo que entra a la lista si el PR
 * la cambió; `todos`: la lista completa), lo explica y escribe `count` y `matrix` en GITHUB_OUTPUT.
 *
 * @param {"cambios" | "todos"} mode
 * @param {string} input la salida de `git diff --name-only` (solo en `cambios`)
 * @param {{
 *   before?: string[],
 *   log?: (line: string) => void,
 *   outputFile?: string,
 *   append?: (file: string, text: string) => void,
 *   patterns?: string[],
 *   exists?: (file: string) => boolean,
 *   glob?: (pattern: string) => string[],
 *   size?: (file: string) => number,
 * }} [options]
 */
export function runCli(mode, input, { before, log = console.log, outputFile = process.env.GITHUB_OUTPUT, append = appendFileSync, ...deps } = {}) {
  const { files, added } = mode === "todos" ? { files: allTargets(deps), added: [] } : targetsFor(input.split("\n"), before, deps);
  const parts = shard(files, deps);
  if (files.length === 0) {
    log("El PR no cambia ningún archivo de la lista de stryker.config.mjs: no hay nada que mutar.");
  } else {
    if (added.length > 0) log(`Entran a la lista de stryker.config.mjs (${added.length}): ${added.join(", ")}`);
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
 * La lista `mutate` de stryker.config.mjs en `ref` (la base del PR u origin/main), solo si `changed` (la
 * salida de `git diff --name-only`) la incluye: si la lista no cambió, no entra ningún archivo.
 *
 * @param {string} changed
 * @param {string | undefined} ref
 * @param {(args: string[]) => string} [git]
 * @returns {Promise<string[] | undefined>}
 */
export async function patternsBefore(changed, ref, git = gitOutput) {
  if (!ref || !changed.split("\n").some((file) => file.trim() === CONFIG_FILE)) return undefined;
  const source = git(["show", `${ref}:${CONFIG_FILE}`]);
  // Se importa desde el texto, sin archivo temporal: la configuración no importa nada.
  const previous = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`);
  return previous.default.mutate;
}

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
 * origin/main (con lo que todavía no está en un commit) y, si cambiaste la lista, los que entran a ella.
 * Devuelve el código de salida de Stryker.
 *
 * @param {{
 *   git?: (args: string[]) => string,
 *   run?: (files: string) => number,
 *   log?: (line: string) => void,
 *   patterns?: string[],
 *   exists?: (file: string) => boolean,
 *   glob?: (pattern: string) => string[],
 * }} [options]
 * @returns {Promise<number>}
 */
export async function runLocal({ git = gitOutput, run = runStryker, log = console.log, ...deps } = {}) {
  const changed = [
    git(["diff", "--name-only", "origin/main...HEAD"]),
    git(["diff", "--name-only", "HEAD"]),
    git(["ls-files", "--others", "--exclude-standard"]),
  ].join("\n");
  const { files, added } = targetsFor(changed.split("\n"), await patternsBefore(changed, "origin/main", git), deps);
  if (files.length === 0) {
    log("No cambiaste ningún archivo de la lista de stryker.config.mjs frente a origin/main: no hay nada que mutar.");
    return 0;
  }
  if (added.length > 0) log(`Entran a la lista de stryker.config.mjs (${added.length}): ${added.join(", ")}`);
  log(`Stryker muta ${files.length} ${files.length === 1 ? "archivo" : "archivos"}: ${files.join(", ")}`);
  return run(files.join(","));
}

// Stryker disable all: punto de entrada de la línea de comandos; se prueba con las funciones exportadas y lo ejercita el CI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  if (mode === "local") process.exitCode = await runLocal();
  else if (mode === "cambios") {
    // BASE: la base del PR (la pone el workflow), para ver qué entra a la lista si el PR la cambió.
    const input = readFileSync(0, "utf8");
    runCli(mode, input, { before: await patternsBefore(input, process.env.BASE) });
  }
  else if (mode === "todos") runCli(mode, "");
  else {
    console.error("Uso: node scripts/mutation-targets.mjs cambios | todos | local");
    process.exitCode = 2;
  }
}
