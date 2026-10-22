import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { botSetting, cronRun, whatsappMessage } from "@/db/schema";
import { ANTHROPIC_CREDENTIALS, MIGRATION_COUNT, REQUIRED_ENV } from "@/lib/health";

// Salud del sistema con la base de pruebas de verdad: la configuración, las migraciones, la base y la
// limpieza diaria. Se simula la sesión.
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));

const { databaseDetails, healthSummary, recentCleanupRuns, systemHealth } = await import("./system");
const { CLEANUP_RUNS_SHOWN } = await import("./health-view");

const NOW = new Date("2026-10-20T15:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
const run = (startedAt: Date, ok = true) =>
  db.insert(cronRun).values({ job: "limpieza", startedAt, finishedAt: startedAt, ok, result: ok ? { messages: 1, events: 0, transactions: 2 } : null, error: ok ? null : "DrizzleQueryError" });

beforeEach(() => {
  mocks.requireAdmin.mockReset().mockResolvedValue({ id: "admin", role: "admin", twoFactorEnabled: true });
  // Toda la configuración, como en producción (las pruebas no tienen las variables de WhatsApp).
  for (const name of [...REQUIRED_ENV, ANTHROPIC_CREDENTIALS[0]]) if (name !== "DATABASE_URL") vi.stubEnv(name, "valor");
  // Una versión compilada hace una hora: todavía no tiene por qué haber corrido la limpieza.
  vi.stubEnv("APP_BUILT_AT", hoursAgo(1).toISOString());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("systemHealth", () => {
  it("con todo configurado, la base al día y sin corridas todavía: todo en orden", async () => {
    const health = await systemHealth(NOW);
    expect(health.problems).toEqual([]);
    expect(health.healthcheckOk).toBe(true);
    expect(health.report.missingEnv).toEqual([]);
    expect(health.report.databaseError).toBeNull();
    expect(health.latencyMs).toBeGreaterThan(0);
    expect(health.lastCleanup).toBeNull();
    expect(health.build.builtAt).toEqual(hoursAgo(1));
  });

  it("la última corrida es la más nueva; si falló, es un problema", async () => {
    await run(hoursAgo(30));
    await run(hoursAgo(6), false);
    const health = await systemHealth(NOW);
    expect(health.lastCleanup).toEqual({ startedAt: hoursAgo(6), ok: false });
    expect(health.problems).toEqual([{ kind: "cleanup_failed", at: hoursAgo(6) }]);
    // El healthcheck no mira la limpieza: es lo mismo que /api/health.
    expect(health.healthcheckOk).toBe(true);
  });

  it("si no corre desde hace más de un día, o nunca corrió en una versión de hace días", async () => {
    await run(hoursAgo(27));
    expect((await systemHealth(NOW)).problems).toEqual([{ kind: "cleanup_late", since: hoursAgo(27) }]);

    await db.delete(cronRun);
    vi.stubEnv("APP_BUILT_AT", hoursAgo(48).toISOString());
    expect((await systemHealth(NOW)).problems).toEqual([{ kind: "cleanup_late", since: null }]);
  });

  it("una variable que falta: el healthcheck falla y se dice cuál, sin su valor", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    const health = await systemHealth(NOW);
    expect(health.healthcheckOk).toBe(false);
    expect(health.problems).toEqual([{ kind: "missing_env", names: ["WHATSAPP_APP_SECRET"] }]);
  });

  it("las corridas de otras tareas no cuentan", async () => {
    await db.insert(cronRun).values({ job: "otra", startedAt: hoursAgo(1), ok: false, error: "TypeError" });
    expect((await systemHealth(NOW)).lastCleanup).toBeNull();
  });

  it("la tarjeta del Inicio tiene los mismos problemas", async () => {
    await run(hoursAgo(2), false);
    expect(await healthSummary(NOW)).toEqual({ problems: [{ kind: "cleanup_failed", at: hoursAgo(2) }], botAlerts: [] });
  });

  it("las alertas del bot que son fallas cuentan como un problema; el tope mensual cerca, no", async () => {
    await run(hoursAgo(2), true);
    // Un mensaje que se quedó sin procesar (falla) y el 90 % del tope mensual usado (aviso).
    await db.insert(botSetting).values({ id: 1, aiPerHour: 20, aiPerDay: 100, monthlyTokenLimit: 10_000 });
    await db.insert(whatsappMessage).values([
      { id: "wamid.sin-procesar", phone: "573001112233", body: "x", status: "received", receivedAt: hoursAgo(1) },
      {
        id: "wamid.con-tokens",
        phone: "573001112233",
        body: "x",
        status: "processed",
        reply: "ok",
        receivedAt: hoursAgo(1),
        aiRequestedAt: hoursAgo(1),
        intent: { kind: "reply", text: "ok", usage: { model: "m", inputTokens: 8_500, outputTokens: 500 } },
      },
    ]);
    const health = await systemHealth(NOW);
    expect(health.botAlerts.map((alert) => alert.kind)).toEqual(["monthly_limit_near", "stuck_messages"]);
    expect(health.problems).toEqual([{ kind: "bot_alerts", count: 1 }]);
  });
});

describe("databaseDetails", () => {
  it("la versión de Postgres, el tamaño y las tablas de la app, de la más grande a la más chica", async () => {
    const details = await databaseDetails();
    expect(details.version).toMatch(/^\d+(\.\d+)?$/);
    expect(details.bytes).toBeGreaterThan(0);
    const names = details.tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["user", "transaction", "whatsapp_message", "cron_run"]));
    // Solo las del esquema de la app: las migraciones de drizzle van en su propio esquema.
    expect(names).not.toContain("__drizzle_migrations");
    const sizes = details.tables.map((t) => t.bytes);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(details.tables.every((t) => Number.isInteger(t.rows) && t.rows >= 0)).toBe(true);
  });
});

describe("recentCleanupRuns", () => {
  it("las últimas, de la más nueva a la más vieja, con lo que borró o el tipo del error", async () => {
    for (let hours = 1; hours <= CLEANUP_RUNS_SHOWN + 2; hours++) await run(hoursAgo(hours * 24), hours !== 2);
    const runs = await recentCleanupRuns();
    expect(runs).toHaveLength(CLEANUP_RUNS_SHOWN);
    expect(runs[0]).toMatchObject({ startedAt: hoursAgo(24), ok: true, result: { messages: 1, events: 0, transactions: 2 }, error: null });
    expect(runs[1]).toMatchObject({ startedAt: hoursAgo(48), ok: false, result: null, error: "DrizzleQueryError" });
  });
});

describe("sin rol de admin", () => {
  it("ninguna consulta responde", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    for (const query of [systemHealth, healthSummary, databaseDetails, recentCleanupRuns]) {
      await expect(query()).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });
});

it("la base de pruebas tiene todas las migraciones del código", async () => {
  const health = await systemHealth(NOW);
  expect(health.problems.find((p) => p.kind === "migrations")).toBeUndefined();
  expect(MIGRATION_COUNT).toBeGreaterThan(20);
});
