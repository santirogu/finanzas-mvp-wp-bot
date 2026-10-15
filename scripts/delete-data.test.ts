import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountSummary } from "../src/modules/account/admin";
import {
  DEFAULT_DAYS,
  MIN_DAYS,
  describeDatabase,
  realDeps,
  runCli,
  type DataOps,
  type Deps,
} from "./delete-data";

const NOW = new Date("2026-10-14T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const ANA: AccountSummary = {
  id: "user-ana",
  name: "Ana Pérez",
  email: "ana@correo.com",
  timezone: "America/Bogota",
  // En Colombia todavía es el 1 de septiembre (en UTC ya es el 2).
  createdAt: new Date("2026-09-02T03:00:00Z"),
  transactions: 23,
  categories: 1,
  phone: "573001112233",
  messages: 41,
};

function setup({
  account = ANA as AccountSummary | null,
  orphans = { messages: 12, phones: 3 },
  answer = "",
  env = { DATABASE_URL: "postgres://usuario:clave-secreta@db.neon.tech:5432/finanzas" } as Record<string, string>,
  envError = null as string | null,
} = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const data = {
    findAccountByEmail: vi.fn(async () => account),
    deleteAccountData: vi.fn(async () => {}),
    countOrphanMessages: vi.fn(async () => orphans),
    deleteOrphanMessages: vi.fn(async () => orphans.messages),
    close: vi.fn(async () => {}),
  } satisfies DataOps;
  const deps = {
    loadEnv: vi.fn(() => envError),
    env: () => env,
    openData: vi.fn(async () => data),
    ask: vi.fn(async () => answer),
    now: () => NOW,
    log: (line: string) => logs.push(line),
    error: (line: string) => errors.push(line),
  } satisfies Deps;
  const run = (...argv: string[]) => runCli(argv, deps);
  return { run, data, deps, logs, errors };
}

describe("describeDatabase", () => {
  it("muestra el servidor y la base, nunca el usuario ni la clave", () => {
    expect(describeDatabase("postgres://usuario:clave@ep-x.neon.tech:5432/neondb?sslmode=require")).toBe(
      "ep-x.neon.tech:5432/neondb",
    );
    expect(describeDatabase("postgres://localhost/finanzas")).toBe("localhost/finanzas");
  });

  it("no rompe ni muestra nada si la URL no es válida", () => {
    expect(describeDatabase("clave-pegada-por-error")).toBe("(DATABASE_URL no es una URL válida)");
  });
});

describe("runCli · argumentos", () => {
  it.each([
    [[]],
    [["cuenta"]],
    [["cuenta", "a@b.co", "otro@b.co"]],
    [["cuenta", "a@b.co", "--dias", "30"]],
    [["huerfanos", "a@b.co"]],
    [["otra-cosa", "a@b.co"]],
    [["cuenta", "a@b.co", "--sin-esto"]],
    [["cuenta", "--env"]],
  ])("con %j explica el uso y no abre la base", async (argv) => {
    const { run, deps, errors } = setup();
    expect(await run(...argv)).toBe(2);
    expect(errors.join("\n")).toContain("pnpm account:delete [--env <archivo>] <correo>");
    expect(errors.join("\n")).toContain(`pnpm messages:cleanup [--env <archivo>] [--dias ${DEFAULT_DAYS}]`);
    expect(deps.loadEnv).not.toHaveBeenCalled();
    expect(deps.openData).not.toHaveBeenCalled();
  });

  it("el mensaje de uso muestra los dos comandos", async () => {
    const { run, errors } = setup();
    await run();
    expect(errors).toEqual([
      [
        "Uso:",
        "  pnpm account:delete [--env <archivo>] <correo>",
        `  pnpm messages:cleanup [--env <archivo>] [--dias ${DEFAULT_DAYS}]`,
      ].join("\n"),
    ]);
  });

  it.each(["6", "0", "-30", "7.5", "treinta", ""])("rechaza --dias %j", async (dias) => {
    const { run, deps, errors } = setup();
    expect(await run("huerfanos", `--dias=${dias}`)).toBe(2);
    expect(errors).toEqual([
      `--dias debe ser un número entero de ${MIN_DAYS} o más: Meta puede reenviar un mensaje hasta ${MIN_DAYS} días después.`,
    ]);
    expect(deps.openData).not.toHaveBeenCalled();
  });

  it("si no puede leer el archivo de --env, lo dice y no abre la base", async () => {
    const { run, deps, errors } = setup({ envError: "ENOENT" });
    expect(await run("cuenta", "--env", ".env.produccion", "ana@correo.com")).toBe(2);
    expect(deps.loadEnv).toHaveBeenCalledWith(".env.produccion");
    expect(errors).toEqual(["No se pudo leer .env.produccion: ENOENT"]);
    expect(deps.openData).not.toHaveBeenCalled();
  });

  it("sin DATABASE_URL no abre la base", async () => {
    const { run, deps, errors } = setup({ env: {} });
    expect(await run("cuenta", "ana@correo.com")).toBe(2);
    expect(deps.loadEnv).toHaveBeenCalledWith(undefined);
    expect(errors).toEqual(["Falta DATABASE_URL en .env."]);
    expect(deps.openData).not.toHaveBeenCalled();
  });

  it("los errores de .env nombran el archivo usado", async () => {
    const { run, errors } = setup({ env: {}, envError: null });
    await run("huerfanos", "--env", ".env.produccion");
    expect(errors).toEqual(["Falta DATABASE_URL en .env.produccion."]);

    const missing = setup({ envError: "ENOENT" });
    await missing.run("huerfanos");
    expect(missing.errors).toEqual(["No se pudo leer .env: ENOENT"]);
  });
});

describe("runCli · cuenta", () => {
  it("muestra en qué base y qué se borrará, y borra solo si se escribe el correo", async () => {
    const { run, data, deps, logs } = setup({ answer: "  ANA@correo.com " });

    expect(await run("cuenta", "Ana@Correo.com")).toBe(0);

    expect(data.findAccountByEmail).toHaveBeenCalledWith("Ana@Correo.com");
    expect(deps.ask).toHaveBeenCalledWith("Para confirmar, escribe el correo de la cuenta: ");
    expect(data.deleteAccountData).toHaveBeenCalledWith("user-ana");
    expect(data.close).toHaveBeenCalledOnce();
    expect(logs).toEqual([
      "Base de datos: db.neon.tech:5432/finanzas",
      "Cuenta: Ana Pérez <ana@correo.com>, creada el 2026-09-01",
      "Se borrará, sin forma de recuperarlo:",
      "  - 23 movimientos",
      "  - 1 categoría propia",
      "  - WhatsApp: +57 300 ••• 2233 vinculado",
      "  - 41 mensajes del bot",
      "  - la cuenta, sus sesiones y sus intentos fallidos de login",
      "✓ Cuenta ana@correo.com eliminada con todos sus datos.",
      "Avísale por correo que ya se borró (lo promete la página /eliminar-datos).",
    ]);
    expect(logs.join("\n")).not.toContain("clave-secreta");
  });

  it("en singular y sin número vinculado", async () => {
    const { run, logs } = setup({
      account: { ...ANA, transactions: 1, categories: 0, phone: null, messages: 1 },
      answer: "ana@correo.com",
    });
    await run("cuenta", "ana@correo.com");
    expect(logs).toEqual(
      expect.arrayContaining([
        "  - 1 movimiento",
        "  - 0 categorías propias",
        "  - WhatsApp: sin número vinculado",
        "  - 1 mensaje del bot",
      ]),
    );
  });

  it("si el correo de confirmación no coincide, no borra nada", async () => {
    for (const answer of ["", "ELIMINAR", "ana@correo.co", "si"]) {
      const { run, data, logs } = setup({ answer });
      expect(await run("cuenta", "ana@correo.com")).toBe(1);
      expect(data.deleteAccountData).not.toHaveBeenCalled();
      expect(data.close).toHaveBeenCalledOnce();
      expect(logs.at(-1)).toBe("El correo no coincide: no se borró nada.");
    }
  });

  it("si no hay cuenta con ese correo, lo dice y no pregunta nada", async () => {
    const { run, data, deps, errors } = setup({ account: null });
    expect(await run("cuenta", " Nadie@Correo.com ")).toBe(1);
    expect(errors).toEqual(["No hay ninguna cuenta con el correo nadie@correo.com. No se borró nada."]);
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.deleteAccountData).not.toHaveBeenCalled();
    expect(data.close).toHaveBeenCalledOnce();
  });

  it("acepta --env en cualquier posición", async () => {
    const { run, deps, data } = setup({ answer: "ana@correo.com" });
    expect(await run("cuenta", "ana@correo.com", "--env", ".env.produccion")).toBe(0);
    expect(deps.loadEnv).toHaveBeenCalledWith(".env.produccion");
    expect(data.deleteAccountData).toHaveBeenCalledOnce();
  });

  it("si la base falla, cierra la conexión igual y deja ver el error", async () => {
    const { run, data } = setup({ answer: "ana@correo.com" });
    data.deleteAccountData.mockRejectedValue(new Error("se cayó la base"));
    await expect(run("cuenta", "ana@correo.com")).rejects.toThrow("se cayó la base");
    expect(data.close).toHaveBeenCalledOnce();
  });
});

describe("runCli · mensajes sin dueño", () => {
  it(`por defecto borra los de más de ${DEFAULT_DAYS} días, después de confirmar`, async () => {
    const { run, data, deps, logs } = setup({ answer: " eliminar " });

    expect(await run("huerfanos")).toBe(0);

    const before = new Date(NOW.getTime() - DEFAULT_DAYS * DAY);
    expect(data.countOrphanMessages).toHaveBeenCalledWith(before);
    expect(deps.ask).toHaveBeenCalledWith("Para confirmar, escribe ELIMINAR: ");
    expect(data.deleteOrphanMessages).toHaveBeenCalledWith(before);
    expect(data.close).toHaveBeenCalledOnce();
    expect(logs).toEqual([
      "Base de datos: db.neon.tech:5432/finanzas",
      "Se borrarán 12 mensajes de WhatsApp de 3 números sin cuenta, recibidos antes del 2026-09-14.",
      "✓ 12 mensajes borrados.",
    ]);
  });

  it("con --dias usa ese plazo (desde el mínimo)", async () => {
    const { run, data } = setup({ answer: "ELIMINAR" });
    expect(await run("huerfanos", "--dias", String(MIN_DAYS))).toBe(0);
    expect(data.deleteOrphanMessages).toHaveBeenCalledWith(new Date(NOW.getTime() - MIN_DAYS * DAY));
  });

  it("en singular", async () => {
    const { run, logs } = setup({ orphans: { messages: 1, phones: 1 }, answer: "ELIMINAR" });
    await run("huerfanos");
    expect(logs.slice(1)).toEqual([
      "Se borrarán 1 mensaje de WhatsApp de 1 número sin cuenta, recibidos antes del 2026-09-14.",
      "✓ 1 mensaje borrado.",
    ]);
  });

  it("si no hay nada que borrar, no pregunta", async () => {
    const { run, data, deps, logs } = setup({ orphans: { messages: 0, phones: 0 } });
    expect(await run("huerfanos", "--dias", "90")).toBe(0);
    expect(logs.at(-1)).toBe("No hay mensajes sin dueño de más de 90 días. No se borró nada.");
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.deleteOrphanMessages).not.toHaveBeenCalled();
    expect(data.close).toHaveBeenCalledOnce();
  });

  it("sin la palabra de confirmación no borra nada", async () => {
    for (const answer of ["", "si", "ELIMINA", "ana@correo.com"]) {
      const { run, data, logs } = setup({ answer });
      expect(await run("huerfanos")).toBe(1);
      expect(data.deleteOrphanMessages).not.toHaveBeenCalled();
      expect(logs.at(-1)).toBe("No se confirmó: no se borró nada.");
    }
  });
});

describe("realDeps.loadEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("con --env, la DATABASE_URL del archivo manda sobre la de la terminal", () => {
    vi.stubEnv("DATABASE_URL", "postgres://localhost/de-la-terminal");
    const dir = mkdtempSync(join(tmpdir(), "delete-data-"));
    const file = join(dir, ".env.produccion");
    writeFileSync(file, "DATABASE_URL=postgres://db.neon.tech/produccion\n");
    try {
      expect(realDeps.loadEnv(file)).toBeNull();
      expect(realDeps.env().DATABASE_URL).toBe("postgres://db.neon.tech/produccion");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("si el archivo de --env no existe, devuelve el error", () => {
    vi.stubEnv("DATABASE_URL", "postgres://localhost/de-la-terminal");
    expect(realDeps.loadEnv(join(tmpdir(), "no-existe", ".env.produccion"))).toMatch(/ENOENT/);
    expect(realDeps.env().DATABASE_URL).toBe("postgres://localhost/de-la-terminal");
  });
});
