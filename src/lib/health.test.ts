import { describe, expect, it, vi } from "vitest";
import journal from "../../drizzle/meta/_journal.json";
import { ANTHROPIC_CREDENTIALS, LATEST_MIGRATION, REQUIRED_ENV, checkHealth } from "./health";

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
