#!/usr/bin/env node
// Detecta "schema drift": cambios en src/db/schema/ sin su migración en drizzle/.
// Si el esquema del código y las migraciones no coinciden, producción recibiría código que espera
// columnas o tablas que no existen. El CI corre este script en cada PR.
//
// Cómo funciona: valida las migraciones con `drizzle-kit check`, corre `drizzle-kit generate` y,
// si este crea archivos nuevos (o no puede decidir, p. ej. ante un renombre), falla mostrando por qué. Al terminar SIEMPRE deja
// drizzle/ exactamente como estaba (la migración de verdad se genera a mano, con un buen nombre).
//
// Uso: pnpm db:check-drift   (no necesita conexión a la base de datos)

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const MIGRATIONS_DIR = "drizzle";

/**
 * Contenido de todos los archivos de una carpeta: { "ruta/relativa": "contenido" }.
 * Usa el tipo que devuelve readdir en vez de revisar cada ruta antes de leerla, para no abrir una
 * ventana entre "revisar" y "usar" el archivo (condición de carrera que señala CodeQL).
 */
export function snapshot(dir) {
  const files = {};
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files[relative(dir, path)] = readFileSync(path, "utf8");
    }
  };
  try {
    walk(dir);
  } catch (error) {
    if (error.code !== "ENOENT") throw error; // la carpeta no existe: snapshot vacío
  }
  return files;
}

/** Archivos agregados o modificados entre dos snapshots. */
export function diffSnapshots(before, after) {
  const added = Object.keys(after).filter((file) => !(file in before));
  const modified = Object.keys(after).filter(
    (file) => file in before && before[file] !== after[file],
  );
  return { added: added.sort(), modified: modified.sort() };
}

/** Devuelve la carpeta al estado del snapshot (borra lo agregado, restaura lo modificado). */
export function restore(dir, before, diff) {
  for (const file of diff.added) rmSync(join(dir, file));
  for (const file of diff.modified) writeFileSync(join(dir, file), before[file]);
}

/**
 * Interpreta el resultado de `drizzle-kit generate`. Ojo: si necesita preguntar algo (p. ej.
 * "¿esta columna es nueva o se renombró?") y no hay terminal, drizzle-kit falla pero termina con
 * código 0 y sin generar nada. Por eso solo se acepta "sin cambios" si lo confirma explícitamente.
 *
 * @returns {"ok" | "drift" | "undecided"}
 */
export function classifyGenerate({ added, output }) {
  if (added.length > 0) return "drift";
  return /No schema changes/i.test(output) ? "ok" : "undecided";
}

function drizzleKit(args) {
  // stdin vacío: si drizzle-kit quiere preguntar algo, falla en vez de esperar para siempre.
  const result = spawnSync("pnpm", ["exec", "drizzle-kit", ...args], {
    encoding: "utf8",
    input: "",
    timeout: 120_000,
  });
  const clean = (text) => (text ?? "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  return { status: result.status, output: `${clean(result.stdout)}\n${clean(result.stderr)}` };
}

/** Primeras líneas útiles de un error (sin el stack trace). */
const errorSummary = (output) =>
  output
    .split("\n")
    .filter((line) => line.trim() && !/^\s+at /.test(line))
    .filter((line) => !/^(No config path|Reading config)/.test(line))
    .slice(0, 5)
    .join("\n");

function main() {
  const check = drizzleKit(["check"]);
  if (check.status !== 0) {
    console.error("✗ Las migraciones de drizzle/ no son consistentes (drizzle-kit check):\n");
    console.error(errorSummary(check.output));
    return 1;
  }

  const before = snapshot(MIGRATIONS_DIR);
  const generate = drizzleKit(["generate", "--name", "schema_drift"]);
  const after = snapshot(MIGRATIONS_DIR);
  const diff = diffSnapshots(before, after);

  try {
    const verdict = classifyGenerate({ added: diff.added, output: generate.output });
    if (verdict === "ok") {
      console.log("✓ El esquema (src/db/schema/) coincide con las migraciones de drizzle/.");
      return 0;
    }
    if (verdict === "undecided") {
      console.error(
        "✗ drizzle-kit no pudo comparar el esquema: necesita que decidas algo (por ejemplo, si una\n" +
          "  columna o tabla se renombró o es nueva) o falló.\n\n" +
          "  Genera la migración en tu terminal y responde sus preguntas:\n" +
          "    pnpm db:generate --name <descripcion>\n\n" +
          `Detalle:\n${errorSummary(generate.output)}`,
      );
      return 1;
    }

    console.error("✗ Hay cambios en src/db/schema/ sin su migración (schema drift).\n");
    for (const file of diff.added.filter((f) => f.endsWith(".sql"))) {
      console.error(`SQL pendiente (${file}):\n\n${after[file]}\n`);
    }
    console.error(
      "Genera la migración y súbela en el mismo PR:\n" +
        "  pnpm db:generate --name <descripcion>   (p. ej. --name agregar-presupuestos)\n" +
        "  git add drizzle/",
    );
    return 1;
  } finally {
    restore(MIGRATIONS_DIR, before, diff);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main());
