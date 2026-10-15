// Borra datos a pedido, desde la terminal. Lo usa el dueño de la app (ver README → Privacidad):
//
//   pnpm account:delete <correo>        una cuenta y todos sus datos, igual que "Eliminar mi
//                                       cuenta" en la app (para quien lo pide por correo)
//   pnpm messages:cleanup [--dias 30]   mensajes de WhatsApp e intentos fallidos de vinculación de
//                                       números sin cuenta, de más de N días
//
// Base de datos: la de .env o la de --env <archivo> (ver scripts/db-cli.ts).
// Siempre muestra en qué base y qué va a borrar, y pide confirmación antes de borrar.

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type { AccountSummary, OrphanCounts } from "../src/modules/account/admin";
import { todayInTimezone } from "../src/lib/dates";
import { CONFIRMATION_WORD } from "../src/modules/account/confirmation";
import { maskPhone } from "../src/modules/whatsapp/phone";
import { exitWith, normalizeEmail, prepareDatabase, realTerminal, type Terminal } from "./db-cli";

/** Meta reintenta un webhook hasta 7 días: hasta entonces el mensaje sirve para no procesarlo dos veces. */
export const MIN_DAYS = 7;
export const DEFAULT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// Las fechas de los mensajes sin dueño se muestran en la hora de Colombia (la de la app por defecto).
const DEFAULT_TIMEZONE = "America/Bogota";

const USAGE = [
  "Uso:",
  "  pnpm account:delete [--env <archivo>] <correo>",
  `  pnpm messages:cleanup [--env <archivo>] [--dias ${DEFAULT_DAYS}]`,
].join("\n");

export type DataOps = {
  findAccountByEmail: (email: string) => Promise<AccountSummary | null>;
  deleteAccountData: (userId: string) => Promise<void>;
  countOrphanData: (before: Date) => Promise<OrphanCounts>;
  deleteOrphanData: (before: Date) => Promise<{ messages: number; events: number }>;
  close: () => Promise<void>;
};

export type Deps = Terminal & {
  /** La base de datos se abre recién después de cargar las variables. */
  openData: () => Promise<DataOps>;
  now: () => Date;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function deleteAccount(email: string, data: DataOps, { ask, log, error }: Deps): Promise<number> {
  const account = await data.findAccountByEmail(email);
  if (!account) {
    error(`No hay ninguna cuenta con el correo ${normalizeEmail(email)}. No se borró nada.`);
    return 1;
  }

  log(`Cuenta: ${account.name} <${account.email}>, creada el ${todayInTimezone(account.timezone, account.createdAt)}`);
  if (account.role === "admin") log("⚠️  Es admin: con la cuenta se pierde también ese acceso.");
  log("Se borrará, sin forma de recuperarlo:");
  log(`  - ${plural(account.transactions, "movimiento", "movimientos")}`);
  log(`  - ${plural(account.categories, "categoría propia", "categorías propias")}`);
  log(`  - WhatsApp: ${account.phone ? `${maskPhone(account.phone)} vinculado` : "sin número vinculado"}`);
  log(`  - ${plural(account.messages, "mensaje", "mensajes")} del bot`);
  log(`  - ${plural(account.events, "evento", "eventos")} de su historial (registro y vinculación)`);
  log("  - la cuenta, sus sesiones y sus intentos fallidos de login");

  const answer = await ask("Para confirmar, escribe el correo de la cuenta: ");
  if (normalizeEmail(answer) !== account.email) {
    log("El correo no coincide: no se borró nada.");
    return 1;
  }
  await data.deleteAccountData(account.id);
  log(`✓ Cuenta ${account.email} eliminada con todos sus datos.`);
  log("Avísale por correo que ya se borró (lo promete la página /eliminar-datos).");
  return 0;
}

async function cleanOrphans(days: number, data: DataOps, { ask, now, log }: Deps): Promise<number> {
  const before = new Date(now().getTime() - days * DAY_MS);
  const { messages, events, phones } = await data.countOrphanData(before);
  if (messages === 0 && events === 0) {
    log(`No hay datos sin dueño de más de ${days} días. No se borró nada.`);
    return 0;
  }

  log(
    `Se borrarán ${plural(messages, "mensaje", "mensajes")} de WhatsApp y ` +
      `${plural(events, "intento fallido", "intentos fallidos")} de vinculación de ` +
      `${plural(phones, "número", "números")} sin cuenta, anteriores al ${todayInTimezone(DEFAULT_TIMEZONE, before)}.`,
  );
  const answer = await ask(`Para confirmar, escribe ${CONFIRMATION_WORD}: `);
  if (answer.trim().toUpperCase() !== CONFIRMATION_WORD) {
    log("No se confirmó: no se borró nada.");
    return 1;
  }
  const deleted = await data.deleteOrphanData(before);
  log(
    `✓ Borrados: ${plural(deleted.messages, "mensaje", "mensajes")} y ` +
      `${plural(deleted.events, "intento fallido", "intentos fallidos")}.`,
  );
  return 0;
}

/** Corre el comando y devuelve el código de salida. */
export async function runCli(argv: string[], deps: Deps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { env: { type: "string" }, dias: { type: "string" } },
    });
  } catch (err) {
    deps.error(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const [command, email, ...extra] = parsed.positionals;
  const { env: envFile, dias } = parsed.values;

  const isAccount = command === "cuenta" && Boolean(email) && extra.length === 0 && dias === undefined;
  const isOrphans = command === "huerfanos" && email === undefined;
  const days = dias === undefined ? DEFAULT_DAYS : Number(dias);
  if (!isAccount && !isOrphans) {
    deps.error(USAGE);
    return 2;
  }
  if (isOrphans && !(Number.isInteger(days) && days >= MIN_DAYS)) {
    deps.error(`--dias debe ser un número entero de ${MIN_DAYS} o más: Meta puede reenviar un mensaje hasta ${MIN_DAYS} días después.`);
    return 2;
  }

  if (!prepareDatabase(envFile, deps)) return 2;

  const data = await deps.openData();
  try {
    return isAccount ? await deleteAccount(email, data, deps) : await cleanOrphans(days, data, deps);
  } finally {
    await data.close();
  }
}

// Stryker disable all: conexión real con la base y la terminal; la lógica de arriba se prueba con
// piezas simuladas (scripts/delete-data.test.ts).
export const realDeps: Deps = {
  ...realTerminal,
  openData: async () => {
    const [{ db }, admin, { deleteAccountData }] = await Promise.all([
      import("../src/db"),
      import("../src/modules/account/admin"),
      import("../src/modules/account/delete-account"),
    ]);
    return { ...admin, deleteAccountData, close: () => db.$client.end() };
  },
  now: () => new Date(),
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  exitWith(runCli(process.argv.slice(2), realDeps));
}
// Stryker restore all
