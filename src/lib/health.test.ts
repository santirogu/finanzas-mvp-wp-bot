import { describe, expect, it, vi } from "vitest";
import journal from "../../drizzle/meta/_journal.json";
import {
  ANTHROPIC_CREDENTIALS,
  LATEST_MIGRATION,
  MIGRATION_COUNT,
  REQUIRED_ENV,
  appliedMigrationCount,
  checkHealth,
  healthReport,
  migrationName,
  migrationsUpToDate,
} from "./health";

const COMPLETE_ENV: Record<string, string> = Object.fromEntries(
  [...REQUIRED_ENV, "ANTHROPIC_API_KEY"].map((name) => [name, "valor"]),
);
const envFrom = (values: Record<string, string>) => (name: string) => values[name];
const without = (...names: string[]) =>
  Object.fromEntries(Object.entries(COMPLETE_ENV).filter(([name]) => !names.includes(name)));

const upToDate = async () => LATEST_MIGRATION;

describe("checkHealth", () => {
  it("está lista con toda la configuración y la base al día", async () => {
    expect(
      await checkHealth({ env: envFrom(COMPLETE_ENV), latestAppliedMigration: upToDate }),
    ).toEqual({ ok: true });
  });

  it("acepta una base con migraciones más nuevas que el código (versión anterior tras un rollback)", async () => {
    const result = await checkHealth({
      env: envFrom(COMPLETE_ENV),
      latestAppliedMigration: async () => LATEST_MIGRATION + 1,
    });
    expect(result).toEqual({ ok: true });
  });

  it("lista todas las variables que faltan", async () => {
    const result = await checkHealth({
      env: envFrom(without("DATABASE_URL", "WHATSAPP_APP_SECRET")),
      latestAppliedMigration: upToDate,
    });
    expect(result).toEqual({
      ok: false,
      problems: ["faltan variables de entorno: DATABASE_URL, WHATSAPP_APP_SECRET"],
    });
  });

  it("para Claude basta con ANTHROPIC_API_KEY o con ANTHROPIC_AUTH_TOKEN", async () => {
    const withToken = { ...without("ANTHROPIC_API_KEY"), ANTHROPIC_AUTH_TOKEN: "token" };
    expect(
      await checkHealth({ env: envFrom(withToken), latestAppliedMigration: upToDate }),
    ).toEqual({ ok: true });

    expect(
      await checkHealth({
        env: envFrom(without("ANTHROPIC_API_KEY")),
        latestAppliedMigration: upToDate,
      }),
    ).toEqual({
      ok: false,
      problems: ["faltan variables de entorno: ANTHROPIC_API_KEY o ANTHROPIC_AUTH_TOKEN"],
    });
  });

  it("falla si a la base le faltan migraciones del código", async () => {
    const result = await checkHealth({
      env: envFrom(COMPLETE_ENV),
      latestAppliedMigration: async () => 100,
      expectedMigration: 200,
    });
    expect(result).toEqual({
      ok: false,
      problems: [
        "la base no tiene todas las migraciones: la última aplicada es 100 y el código espera 200",
      ],
    });
  });

  it("falla si la base no tiene ninguna migración", async () => {
    const result = await checkHealth({
      env: envFrom(COMPLETE_ENV),
      latestAppliedMigration: async () => null,
      expectedMigration: 200,
    });
    expect(result).toEqual({
      ok: false,
      problems: [
        "la base no tiene todas las migraciones: la última aplicada es ninguna y el código espera 200",
      ],
    });
  });

  it("reporta si no puede consultar la base, junto con los demás problemas", async () => {
    const result = await checkHealth({
      env: envFrom(without("BETTER_AUTH_SECRET")),
      latestAppliedMigration: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });
    expect(result).toEqual({
      ok: false,
      problems: [
        "faltan variables de entorno: BETTER_AUTH_SECRET",
        "no se pudo consultar la base de datos: connect ECONNREFUSED",
      ],
    });
  });

  it("reporta errores que no son Error", async () => {
    const result = await checkHealth({
      env: envFrom(COMPLETE_ENV),
      latestAppliedMigration: () => Promise.reject("sin conexión"),
    });
    expect(result).toEqual({
      ok: false,
      problems: ["no se pudo consultar la base de datos: sin conexión"],
    });
  });

  it("por defecto lee process.env e ignora valores con solo espacios (envVar)", async () => {
    for (const [name, value] of Object.entries(COMPLETE_ENV)) vi.stubEnv(name, value);
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", undefined);
    vi.stubEnv("WHATSAPP_APP_SECRET", "  \n");
    try {
      expect(await checkHealth({ latestAppliedMigration: upToDate })).toEqual({
        ok: false,
        problems: ["faltan variables de entorno: WHATSAPP_APP_SECRET"],
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("healthReport", () => {
  it("cada cosa por separado: las variables que faltan (por nombre) y las migraciones", async () => {
    expect(await healthReport({ env: envFrom(without("CRON_SECRET", "ANTHROPIC_API_KEY")), latestAppliedMigration: async () => 100, expectedMigration: 200 })).toEqual({
      missingEnv: ["CRON_SECRET", "ANTHROPIC_API_KEY o ANTHROPIC_AUTH_TOKEN"],
      appliedMigration: 100,
      expectedMigration: 200,
      databaseError: null,
    });
  });

  it("si la base no responde, guarda el error tal cual (o uno genérico si rechaza sin nada)", async () => {
    const error = new Error("connect ECONNREFUSED");
    expect(await healthReport({ env: envFrom(COMPLETE_ENV), latestAppliedMigration: () => Promise.reject(error) })).toMatchObject({
      appliedMigration: null,
      databaseError: error,
    });
    expect((await healthReport({ env: envFrom(COMPLETE_ENV), latestAppliedMigration: () => Promise.reject(null) })).databaseError).toBe("error desconocido");
  });
});

describe("migrationsUpToDate", () => {
  const report = { missingEnv: [], appliedMigration: 200, expectedMigration: 200, databaseError: null };
  it("al día con la última o una más nueva; no sin ninguna, con una vieja o sin base", () => {
    expect(migrationsUpToDate(report)).toBe(true);
    expect(migrationsUpToDate({ ...report, appliedMigration: 201 })).toBe(true);
    expect(migrationsUpToDate({ ...report, appliedMigration: 199 })).toBe(false);
    expect(migrationsUpToDate({ ...report, appliedMigration: null })).toBe(false);
    expect(migrationsUpToDate({ ...report, databaseError: new Error("x") })).toBe(false);
  });
});

describe("las migraciones del código", () => {
  it("cuántas hay, cuántas tiene una base y el nombre de cada una", () => {
    const [first, second] = journal.entries;
    expect(MIGRATION_COUNT).toBe(journal.entries.length);
    expect(appliedMigrationCount(null)).toBe(0);
    expect(appliedMigrationCount(first.when)).toBe(1);
    expect(appliedMigrationCount(second.when)).toBe(2);
    expect(appliedMigrationCount(LATEST_MIGRATION)).toBe(MIGRATION_COUNT);
    expect(appliedMigrationCount(LATEST_MIGRATION + 1)).toBe(MIGRATION_COUNT);
    expect(migrationName(first.when)).toBe("0000_init");
    expect(migrationName(LATEST_MIGRATION)).toBe(journal.entries.at(-1)!.tag);
    expect(migrationName(LATEST_MIGRATION + 1)).toBeNull();
    expect(migrationName(null)).toBeNull();
  });
});

describe("constantes", () => {
  it("la última migración esperada es la última del journal de drizzle", () => {
    const whens = journal.entries.map((entry) => entry.when);
    expect(LATEST_MIGRATION).toBe(whens[whens.length - 1]);
    expect(whens.every((when) => when <= LATEST_MIGRATION)).toBe(true);
  });

  it("revisa las variables de las que depende la app en producción", () => {
    expect(REQUIRED_ENV).toEqual([
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "WHATSAPP_VERIFY_TOKEN",
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "CRON_SECRET",
    ]);
    expect(ANTHROPIC_CREDENTIALS).toEqual(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]);
  });
});
