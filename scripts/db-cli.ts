// Piezas comunes de los comandos de terminal que trabajan sobre la base (delete-data.ts y
// admin.ts): cargar la DATABASE_URL, mostrar en qué base se va a trabajar y preguntar.
//
// Usan la DATABASE_URL de .env (la base local). Para otra base, como producción:
// --env <archivo> con su DATABASE_URL (un archivo .env*, que git ignora).

import { config } from "dotenv";
import { createInterface } from "node:readline/promises";

/** Lo que los comandos necesitan de la terminal; en las pruebas se reemplaza por piezas simuladas. */
export type Terminal = {
  /** Carga las variables de entorno (de .env o del archivo indicado); devuelve un error si falla. */
  loadEnv: (file?: string) => string | null;
  env: () => Record<string, string | undefined>;
  ask: (question: string) => Promise<string>;
  log: (line: string) => void;
  error: (line: string) => void;
};

/** "postgres://usuario:clave@host:5432/base" → "host:5432/base" (nunca muestra la clave). */
export function describeDatabase(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname}`;
  } catch {
    return "(DATABASE_URL no es una URL válida)";
  }
}

// Como normalizeEmail (src/modules/auth/lockout.ts), que no se importa aquí: abre la base al cargarse.
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Carga la DATABASE_URL (de .env o de --env) y muestra en qué base se va a trabajar.
 * Devuelve true si se puede seguir; si no, ya explicó el problema.
 */
export function prepareDatabase(envFile: string | undefined, { loadEnv, env, log, error }: Terminal): boolean {
  const source = envFile ?? ".env";
  const envError = loadEnv(envFile);
  if (envError) {
    error(`No se pudo leer ${source}: ${envError}`);
    return false;
  }
  const url = env().DATABASE_URL;
  if (!url) {
    error(`Falta DATABASE_URL en ${source}.`);
    return false;
  }
  log(`Base de datos: ${describeDatabase(url)}`);
  return true;
}

// Stryker disable all: la terminal y los archivos de verdad; la lógica de los comandos se prueba
// con piezas simuladas.
export const realTerminal: Terminal = {
  loadEnv: (file) => {
    // Con --env, el archivo manda aunque la terminal ya tenga una DATABASE_URL.
    const result = config({ path: file ?? ".env", override: Boolean(file), quiet: true });
    return file && result.error ? result.error.message : null;
  },
  env: () => process.env,
  ask: async (question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question(question);
    } finally {
      rl.close();
    }
  },
  log: (line) => console.log(line),
  error: (line) => console.error(line),
};

/** Corre un comando y termina el proceso con su código de salida. */
export function exitWith(run: Promise<number>): void {
  run.then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
// Stryker restore all
