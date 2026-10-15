// Roles desde la terminal: la única forma de dar o quitar el rol de admin (la app no puede).
// Lo usa el dueño de la app (ver README → Roles):
//
//   pnpm admin:grant <correo>    da el rol de admin a una cuenta que ya existe
//   pnpm admin:revoke <correo>   se lo quita (vuelve a ser usuario)
//   pnpm admin:list              muestra quiénes son admin (y si tienen la verificación activa)
//   pnpm admin:reset-2fa <correo>  reinicia la verificación en dos pasos (celular perdido)
//
// Base de datos: la de .env o la de --env <archivo> (ver scripts/db-cli.ts). Antes de cambiar un
// rol muestra en qué base y qué cuenta, y pide escribir el correo de nuevo.

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { todayInTimezone } from "../src/lib/dates";
import type { Role } from "../src/lib/roles";
import type { AccountRole } from "../src/modules/account/terminal";
import { exitWith, normalizeEmail, prepareDatabase, realTerminal, type Terminal } from "./db-cli";

const USAGE = [
  "Uso:",
  "  pnpm admin:grant [--env <archivo>] <correo>",
  "  pnpm admin:revoke [--env <archivo>] <correo>",
  "  pnpm admin:list [--env <archivo>]",
  "  pnpm admin:reset-2fa [--env <archivo>] <correo>",
].join("\n");

const ROLE_NAMES: Record<Role, string> = { user: "usuario", admin: "admin" };

export type RoleOps = {
  findAccountRole: (email: string) => Promise<AccountRole | null>;
  setRole: (userId: string, role: Role) => Promise<boolean>;
  listAdmins: () => Promise<AccountRole[]>;
  resetTwoFactor: (userId: string) => Promise<{ sessionsClosed: number } | null>;
  close: () => Promise<void>;
};

export type Deps = Terminal & {
  /** La base de datos se abre recién después de cargar las variables. */
  openData: () => Promise<RoleOps>;
};

const describeAccount = (a: AccountRole) =>
  `${a.name} <${a.email}>, creada el ${todayInTimezone(a.timezone, a.createdAt)}`;

async function changeRole(email: string, role: Role, data: RoleOps, { ask, log, error }: Deps): Promise<number> {
  const account = await data.findAccountRole(email);
  if (!account) {
    error(
      `No hay ninguna cuenta con el correo ${normalizeEmail(email)}. ` +
        "Primero hay que registrarse en la app con ese correo. No se cambió nada.",
    );
    return 1;
  }
  if (account.role === role) {
    log(`${account.email} ya tiene el rol ${ROLE_NAMES[role]}. No se cambió nada.`);
    return 0;
  }

  log(`Cuenta: ${describeAccount(account)}`);
  log(`Rol: ${ROLE_NAMES[account.role]} → ${ROLE_NAMES[role]}`);
  if (role === "admin") {
    log("Un admin ve la sección de administración, con datos de todas las cuentas.");
  }

  const answer = await ask("Para confirmar, escribe el correo de la cuenta: ");
  if (normalizeEmail(answer) !== account.email) {
    log("El correo no coincide: no se cambió nada.");
    return 1;
  }
  if (!(await data.setRole(account.id, role))) {
    error("La cuenta ya no existe (¿se borró mientras tanto?). No se cambió nada.");
    return 1;
  }

  log(`✓ ${account.email} ahora tiene el rol ${ROLE_NAMES[role]}. Aplica desde su siguiente clic, sin cerrar sesión.`);
  if (role === "user" && (await data.listAdmins()).length === 0) {
    log("Ya no queda ningún admin. Puedes volver a dar el rol con pnpm admin:grant.");
  }
  return 0;
}

async function resetTwoFactor(email: string, data: RoleOps, { ask, log, error }: Deps): Promise<number> {
  const account = await data.findAccountRole(email);
  if (!account) {
    error(`No hay ninguna cuenta con el correo ${normalizeEmail(email)}. No se cambió nada.`);
    return 1;
  }
  if (!account.twoFactorEnabled) {
    log(`${account.email} no tiene la verificación en dos pasos activa. No se cambió nada.`);
    return 0;
  }

  log(`Cuenta: ${describeAccount(account)}`);
  log("Verificación en dos pasos: activa → desactivada (se borran la clave y los códigos de respaldo)");
  log("Se cierran todas sus sesiones. Para volver a administrar tendrá que entrar y configurarla de nuevo.");

  const answer = await ask("Para confirmar, escribe el correo de la cuenta: ");
  if (normalizeEmail(answer) !== account.email) {
    log("El correo no coincide: no se cambió nada.");
    return 1;
  }
  const result = await data.resetTwoFactor(account.id);
  if (!result) {
    error("La cuenta ya no existe (¿se borró mientras tanto?). No se cambió nada.");
    return 1;
  }
  log(`✓ Verificación en dos pasos de ${account.email} reiniciada. Sesiones cerradas: ${result.sessionsClosed}.`);
  return 0;
}

const twoFactorStatus = (a: AccountRole) =>
  a.twoFactorEnabled ? "verificación en dos pasos activa" : "verificación en dos pasos pendiente";

async function listAdmins(data: RoleOps, { log }: Deps): Promise<number> {
  const admins = await data.listAdmins();
  if (admins.length === 0) {
    log("No hay ningún admin. Para crear uno: pnpm admin:grant <correo>.");
    return 0;
  }
  log(`Admins (${admins.length}):`);
  for (const admin of admins) log(`  - ${describeAccount(admin)} · ${twoFactorStatus(admin)}`);
  return 0;
}

/** Corre el comando y devuelve el código de salida. */
export async function runCli(argv: string[], deps: Deps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { env: { type: "string" } } });
  } catch (err) {
    deps.error(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const [command, email, ...extra] = parsed.positionals;
  const withEmail = Boolean(email) && extra.length === 0;
  const changesRole = (command === "grant" || command === "revoke") && withEmail;
  const resets = command === "reset-2fa" && withEmail;
  const lists = command === "list" && email === undefined;
  if (!changesRole && !resets && !lists) {
    deps.error(USAGE);
    return 2;
  }

  if (!prepareDatabase(parsed.values.env, deps)) return 2;
  const data = await deps.openData();
  try {
    if (lists) return await listAdmins(data, deps);
    if (resets) return await resetTwoFactor(email, data, deps);
    return await changeRole(email, command === "grant" ? "admin" : "user", data, deps);
  } finally {
    await data.close();
  }
}

// Stryker disable all: conexión real con la base y la terminal; la lógica de arriba se prueba con
// piezas simuladas (scripts/admin.test.ts) y las consultas, en integración.
export const realDeps: Deps = {
  ...realTerminal,
  openData: async () => {
    const [{ db }, { findAccountRole, setRole, listAdmins, resetTwoFactor }] = await Promise.all([
      import("../src/db"),
      import("../src/modules/account/terminal"),
    ]);
    return { findAccountRole, setRole, listAdmins, resetTwoFactor, close: () => db.$client.end() };
  },
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  exitWith(runCli(process.argv.slice(2), realDeps));
}
// Stryker restore all
