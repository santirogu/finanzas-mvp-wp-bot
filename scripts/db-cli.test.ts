import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeDatabase, normalizeEmail, prepareDatabase, realTerminal, type Terminal } from "./db-cli";

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

describe("normalizeEmail", () => {
  it("quita espacios y pasa a minúsculas, como al registrarse", () => {
    expect(normalizeEmail("  Ana@Correo.COM ")).toBe("ana@correo.com");
  });
});

describe("prepareDatabase", () => {
  function terminal({
    envError = null as string | null,
    env = { DATABASE_URL: "postgres://u:clave@db.neon.tech/finanzas" } as Record<string, string>,
  } = {}) {
    const logs: string[] = [];
    const errors: string[] = [];
    const t = {
      loadEnv: vi.fn(() => envError),
      env: () => env,
      ask: vi.fn(async () => ""),
      log: (line: string) => logs.push(line),
      error: (line: string) => errors.push(line),
    } satisfies Terminal;
    return { t, logs, errors };
  }

  it("con la DATABASE_URL de .env muestra la base sin la clave", () => {
    const { t, logs, errors } = terminal();
    expect(prepareDatabase(undefined, t)).toBe(true);
    expect(t.loadEnv).toHaveBeenCalledWith(undefined);
    expect(logs).toEqual(["Base de datos: db.neon.tech/finanzas"]);
    expect(errors).toEqual([]);
  });

  it("con --env usa ese archivo", () => {
    const { t } = terminal();
    expect(prepareDatabase(".env.produccion", t)).toBe(true);
    expect(t.loadEnv).toHaveBeenCalledWith(".env.produccion");
  });

  it("si no puede leer el archivo, lo dice con su nombre y no sigue", () => {
    const { t, logs, errors } = terminal({ envError: "ENOENT" });
    expect(prepareDatabase(".env.produccion", t)).toBe(false);
    expect(errors).toEqual(["No se pudo leer .env.produccion: ENOENT"]);
    expect(logs).toEqual([]);

    const local = terminal({ envError: "ENOENT" });
    expect(prepareDatabase(undefined, local.t)).toBe(false);
    expect(local.errors).toEqual(["No se pudo leer .env: ENOENT"]);
  });

  it("sin DATABASE_URL no sigue", () => {
    const { t, logs, errors } = terminal({ env: {} });
    expect(prepareDatabase(undefined, t)).toBe(false);
    expect(errors).toEqual(["Falta DATABASE_URL en .env."]);
    expect(logs).toEqual([]);

    const prod = terminal({ env: { DATABASE_URL: "" } });
    expect(prepareDatabase(".env.produccion", prod.t)).toBe(false);
    expect(prod.errors).toEqual(["Falta DATABASE_URL en .env.produccion."]);
  });
});

describe("realTerminal.loadEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("con --env, la DATABASE_URL del archivo manda sobre la de la terminal", () => {
    vi.stubEnv("DATABASE_URL", "postgres://localhost/de-la-terminal");
    const dir = mkdtempSync(join(tmpdir(), "delete-data-"));
    const file = join(dir, ".env.produccion");
    writeFileSync(file, "DATABASE_URL=postgres://db.neon.tech/produccion\n");
    try {
      expect(realTerminal.loadEnv(file)).toBeNull();
      expect(realTerminal.env().DATABASE_URL).toBe("postgres://db.neon.tech/produccion");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("si el archivo de --env no existe, devuelve el error", () => {
    vi.stubEnv("DATABASE_URL", "postgres://localhost/de-la-terminal");
    expect(realTerminal.loadEnv(join(tmpdir(), "no-existe", ".env.produccion"))).toMatch(/ENOENT/);
    expect(realTerminal.env().DATABASE_URL).toBe("postgres://localhost/de-la-terminal");
  });
});
