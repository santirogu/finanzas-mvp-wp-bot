import { describe, expect, it, vi } from "vitest";
import type { AccountSummary } from "../src/modules/account/terminal";
import { DEFAULT_DAYS, MIN_DAYS, runCli, type DataOps, type Deps } from "./delete-data";

const NOW = new Date("2026-10-14T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const ANA: AccountSummary = {
  id: "user-ana",
  name: "Ana Pérez",
  email: "ana@correo.com",
  timezone: "America/Bogota",
  role: "user",
  // En Colombia todavía es el 1 de septiembre (en UTC ya es el 2).
  createdAt: new Date("2026-09-02T03:00:00Z"),
  transactions: 23,
  categories: 1,
  phone: "573001112233",
  messages: 41,
  events: 7,
};

function setup({
  account = ANA as AccountSummary | null,
  orphans = { messages: 12, events: 4, phones: 3 },
  answer = "",
  env = { DATABASE_URL: "postgres://usuario:clave-secreta@db.neon.tech:5432/finanzas" } as Record<string, string>,
  envError = null as string | null,
} = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const data = {
    findAccountByEmail: vi.fn(async () => account),
    deleteAccountData: vi.fn(async () => {}),
    countOrphanData: vi.fn(async () => orphans),
    deleteOrphanData: vi.fn(async () => ({ messages: orphans.messages, events: orphans.events })),
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
      "  - 7 eventos de su historial (registro y vinculación)",
      "  - la cuenta, sus sesiones y sus intentos fallidos de login",
      "✓ Cuenta ana@correo.com eliminada con todos sus datos.",
      "Avísale por correo que ya se borró (lo promete la página /eliminar-datos).",
    ]);
    expect(logs.join("\n")).not.toContain("clave-secreta");
  });

  it("avisa si la cuenta es admin", async () => {
    const { run, logs } = setup({ account: { ...ANA, role: "admin" }, answer: "ana@correo.com" });
    expect(await run("cuenta", "ana@correo.com")).toBe(0);
    expect(logs.slice(1, 3)).toEqual([
      "Cuenta: Ana Pérez <ana@correo.com>, creada el 2026-09-01",
      "⚠️  Es admin: con la cuenta se pierde también ese acceso.",
    ]);
  });

  it("en singular y sin número vinculado", async () => {
    const { run, logs } = setup({
      account: { ...ANA, transactions: 1, categories: 0, phone: null, messages: 1, events: 1 },
      answer: "ana@correo.com",
    });
    await run("cuenta", "ana@correo.com");
    expect(logs).toEqual(
      expect.arrayContaining([
        "  - 1 movimiento",
        "  - 0 categorías propias",
        "  - WhatsApp: sin número vinculado",
        "  - 1 mensaje del bot",
        "  - 1 evento de su historial (registro y vinculación)",
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
    expect(data.countOrphanData).toHaveBeenCalledWith(before);
    expect(deps.ask).toHaveBeenCalledWith("Para confirmar, escribe ELIMINAR: ");
    expect(data.deleteOrphanData).toHaveBeenCalledWith(before);
    expect(data.close).toHaveBeenCalledOnce();
    expect(logs).toEqual([
      "Base de datos: db.neon.tech:5432/finanzas",
      "Se borrarán 12 mensajes de WhatsApp y 4 intentos fallidos de vinculación de 3 números sin cuenta, anteriores al 2026-09-14.",
      "✓ Borrados: 12 mensajes y 4 intentos fallidos.",
    ]);
  });

  it("con --dias usa ese plazo (desde el mínimo)", async () => {
    const { run, data } = setup({ answer: "ELIMINAR" });
    expect(await run("huerfanos", "--dias", String(MIN_DAYS))).toBe(0);
    expect(data.deleteOrphanData).toHaveBeenCalledWith(new Date(NOW.getTime() - MIN_DAYS * DAY));
  });

  it("en singular", async () => {
    const { run, logs } = setup({ orphans: { messages: 1, events: 1, phones: 1 }, answer: "ELIMINAR" });
    await run("huerfanos");
    expect(logs.slice(1)).toEqual([
      "Se borrarán 1 mensaje de WhatsApp y 1 intento fallido de vinculación de 1 número sin cuenta, anteriores al 2026-09-14.",
      "✓ Borrados: 1 mensaje y 1 intento fallido.",
    ]);
  });

  it("también cuando solo hay mensajes o solo intentos fallidos", async () => {
    for (const orphans of [
      { messages: 2, events: 0, phones: 1 },
      { messages: 0, events: 3, phones: 2 },
    ]) {
      const { run, data } = setup({ orphans, answer: "ELIMINAR" });
      expect(await run("huerfanos")).toBe(0);
      expect(data.deleteOrphanData).toHaveBeenCalledOnce();
    }
  });

  it("si no hay nada que borrar, no pregunta", async () => {
    const { run, data, deps, logs } = setup({ orphans: { messages: 0, events: 0, phones: 0 } });
    expect(await run("huerfanos", "--dias", "90")).toBe(0);
    expect(logs.at(-1)).toBe("No hay datos sin dueño de más de 90 días. No se borró nada.");
    expect(deps.ask).not.toHaveBeenCalled();
    expect(data.deleteOrphanData).not.toHaveBeenCalled();
    expect(data.close).toHaveBeenCalledOnce();
  });

  it("sin la palabra de confirmación no borra nada", async () => {
    for (const answer of ["", "si", "ELIMINA", "ana@correo.com"]) {
      const { run, data, logs } = setup({ answer });
      expect(await run("huerfanos")).toBe(1);
      expect(data.deleteOrphanData).not.toHaveBeenCalled();
      expect(logs.at(-1)).toBe("No se confirmó: no se borró nada.");
    }
  });
});
