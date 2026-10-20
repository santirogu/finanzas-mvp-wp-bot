// Copias de la base LOCAL: pnpm db:backup, pnpm db:restore [archivo] y la copia automática de pnpm dev.
//
// La base de desarrollo vive en el Postgres de `pnpm db:up` (docker-compose.yml, servicio db): un
// reinicio del Mac no la borra, pero sí un "Factory Reset" de Docker o Rancher Desktop, desinstalarlo o
// un `docker system prune --volumes`. Las copias van a backups/ (git lo ignora: el repo es público) y se
// guardan las últimas BACKUPS_TO_KEEP. Solo trabajan con una DATABASE_URL de este equipo (localhost):
// nunca copian ni pisan otra base, como la de producción.

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createGunzip, createGzip } from "node:zlib";
import { exitWith, realTerminal, type Terminal } from "./db-cli";

export const BACKUP_DIR = "backups";
export const BACKUPS_TO_KEEP = 10;
/** La copia automática de pnpm dev se hace si la última tiene más de un día. */
export const AUTO_BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const USAGE = [
  "Uso:",
  "  pnpm db:backup              copia la base local en backups/",
  "  pnpm db:restore [archivo]   la reemplaza con una copia (sin archivo, la más reciente)",
].join("\n");

export type Target = { user: string; database: string };

/** El usuario y la base de una DATABASE_URL de este equipo; null si es de otro servidor. */
export function localTarget(url: string): Target | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!LOCAL_HOSTS.has(parsed.hostname) || !parsed.username || !database) return null;
  return { user: decodeURIComponent(parsed.username), database };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "finanzas-2026-10-16-164205.sql.gz", con la hora del equipo: ordenados por nombre, van por fecha. */
export function backupName(database: string, date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${database}-${day}-${time}.sql.gz`;
}

/** La fecha de una copia según su nombre (null si el nombre no es de una copia de esa base). */
export function backupDate(database: string, name: string): Date | null {
  // Stryker disable next-line Regex: (.+) es codicioso: si coincide en algún lugar, también desde el comienzo
  const match = name.match(/^(.+)-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.sql\.gz$/);
  if (!match || match[1] !== database) return null;
  const [year, month, day, hours, minutes, seconds] = match.slice(2).map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

/** Las copias de esa base, de la más vieja a la más nueva. */
export function backupsOf(database: string, names: string[]): string[] {
  return names.filter((name) => backupDate(database, name) !== null).sort();
}

export type Deps = Terminal & {
  now: () => Date;
  /** Los nombres de los archivos de backups/ (vacío si la carpeta no existe). */
  listBackups: () => string[];
  /** Guarda la copia en ese archivo; devuelve el error si falla. */
  dump: (target: Target, file: string) => Promise<string | null>;
  /** Reemplaza la base con esa copia; devuelve el error si falla. */
  restore: (target: Target, file: string) => Promise<string | null>;
  remove: (file: string) => void;
};

const DOCKER_HINT = "¿Está abierto Docker (o Rancher Desktop) y la base levantada con pnpm db:up?";

async function backup(target: Target, deps: Deps): Promise<number> {
  const name = backupName(target.database, deps.now());
  const failure = await deps.dump(target, name);
  if (failure) {
    deps.error(`No se pudo copiar la base: ${failure}\n${DOCKER_HINT}`);
    return 1;
  }
  const old = backupsOf(target.database, deps.listBackups()).slice(0, -BACKUPS_TO_KEEP);
  for (const file of old) deps.remove(file);
  deps.log(`✓ Copia guardada en ${BACKUP_DIR}/${name}${old.length ? ` (se borraron ${old.length} viejas)` : ""}.`);
  return 0;
}

/** La de pnpm dev: solo si la última copia tiene más de un día, y nunca frena el servidor. */
async function autoBackup(target: Target, deps: Deps): Promise<number> {
  const last = backupsOf(target.database, deps.listBackups()).at(-1);
  const lastDate = last ? backupDate(target.database, last)! : null;
  if (lastDate && deps.now().getTime() - lastDate.getTime() < AUTO_BACKUP_EVERY_MS) return 0;
  const name = backupName(target.database, deps.now());
  const failure = await deps.dump(target, name);
  if (failure) {
    deps.error(`⚠ No se hizo la copia diaria de la base local (${failure}). ${DOCKER_HINT}`);
    return 0;
  }
  for (const file of backupsOf(target.database, deps.listBackups()).slice(0, -BACKUPS_TO_KEEP)) deps.remove(file);
  deps.log(`✓ Copia diaria de la base local en ${BACKUP_DIR}/${name}.`);
  return 0;
}

async function restore(target: Target, file: string | undefined, deps: Deps): Promise<number> {
  const backups = backupsOf(target.database, deps.listBackups());
  const name = file === undefined ? backups.at(-1) : path.basename(file);
  if (!name) {
    deps.error(`No hay copias de ${target.database} en ${BACKUP_DIR}/. Haz una con pnpm db:backup.`);
    return 1;
  }
  if (!backups.includes(name)) {
    deps.error(`No existe la copia ${BACKUP_DIR}/${name}. Las que hay:\n${backups.map((b) => `  - ${b}`).join("\n") || "  (ninguna)"}`);
    return 1;
  }
  deps.log(`Copia: ${BACKUP_DIR}/${name}`);
  deps.log(`Reemplaza todo lo que tiene ahora la base ${target.database} (cuentas, movimientos, mensajes) por esa copia.`);
  const answer = await deps.ask(`Para confirmar, escribe el nombre de la base (${target.database}): `);
  if (answer.trim() !== target.database) {
    deps.log("No coincide: no se cambió nada.");
    return 1;
  }
  const failure = await deps.restore(target, name);
  if (failure) {
    deps.error(`No se pudo restaurar: ${failure}\n${DOCKER_HINT}`);
    return 1;
  }
  deps.log(`✓ La base ${target.database} quedó como en esa copia.`);
  return 0;
}

/** Corre el comando y devuelve el código de salida. */
export async function runCli(argv: string[], deps: Deps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: {} });
  } catch (err) {
    deps.error(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const [command, file, ...extra] = parsed.positionals;
  const valid =
    extra.length === 0 && (((command === "backup" || command === "auto") && file === undefined) || command === "restore");
  if (!valid) {
    deps.error(USAGE);
    return 2;
  }

  const auto = command === "auto";
  const envError = deps.loadEnv();
  const url = envError ? undefined : deps.env().DATABASE_URL;
  const target = url ? localTarget(url) : null;
  if (!target) {
    // La copia automática no tiene nada que hacer si la base no es de este equipo (o no hay .env).
    if (auto) return 0;
    deps.error(
      url
        ? "La DATABASE_URL de .env no es una base de este equipo (localhost): estas copias son solo para la base local."
        : "Falta DATABASE_URL en .env.",
    );
    return 2;
  }
  if (auto) return autoBackup(target, deps);
  if (command === "backup") return backup(target, deps);
  return restore(target, file, deps);
}

// Stryker disable all: Docker, los archivos y la terminal de verdad; la lógica de arriba se prueba con
// piezas simuladas (scripts/db-backup.test.ts) y las copias de verdad, a mano (README → Copias de la
// base local).

/** Corre un comando en el servicio db de Docker Compose, recibiendo su entrada o leyendo su salida. */
function compose(args: string[], pipe: "entrada" | "salida") {
  const child = spawn("docker", ["compose", "exec", "-T", "db", ...args], {
    stdio: [pipe === "entrada" ? "pipe" : "ignore", pipe === "salida" ? "pipe" : "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr!.on("data", (chunk) => (stderr += chunk));
  const exited = new Promise<string | null>((resolve) => {
    child.on("error", (err) => resolve(err.message));
    child.on("close", (code) => resolve(code === 0 ? null : stderr.trim().split("\n").at(-1) || `salió con código ${code}`));
  });
  return { child, exited };
}

const inBackups = (file: string) => path.join(BACKUP_DIR, file);

export const realDeps: Deps = {
  ...realTerminal,
  now: () => new Date(),
  listBackups: () => {
    try {
      return readdirSync(BACKUP_DIR);
    } catch {
      return [];
    }
  },
  dump: async ({ user, database }, file) => {
    mkdirSync(BACKUP_DIR, { recursive: true });
    // Primero a un archivo temporal: una copia a medias nunca queda con nombre de copia.
    const partial = inBackups(`.${file}.parcial`);
    const { child, exited } = compose(
      ["pg_dump", "-U", user, "-d", database, "--clean", "--if-exists", "--no-owner", "--no-privileges"],
      "salida",
    );
    const written = pipeline(child.stdout!, createGzip(), createWriteStream(partial)).then(
      () => null,
      (err: Error) => err.message,
    );
    const failure = (await exited) ?? (await written);
    if (failure) {
      rmSync(partial, { force: true });
      return failure;
    }
    renameSync(partial, inBackups(file));
    return null;
  },
  restore: async ({ user, database }, file) => {
    const { child, exited } = compose(
      ["psql", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-U", user, "-d", database],
      "entrada",
    );
    const read = pipeline(createReadStream(inBackups(file)), createGunzip(), child.stdin!).then(
      () => null,
      (err: Error) => err.message,
    );
    return (await exited) ?? (await read);
  },
  remove: (file) => rmSync(inBackups(file), { force: true }),
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  exitWith(runCli(process.argv.slice(2), realDeps));
}
