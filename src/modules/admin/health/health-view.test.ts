import { describe, expect, it } from "vitest";
import { LATEST_MIGRATION, MIGRATION_COUNT, type HealthReport } from "@/lib/health";
import {
  CLEANUP_LATE_HOURS,
  CLEANUP_PATH,
  cleanupResultLabel,
  cronScheduleLabel,
  envNames,
  formatBytes,
  healthcheckOk,
  healthProblems,
  problemLabel,
} from "./health-view";

const NOW = new Date("2026-10-20T15:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
const report = (changes: Partial<HealthReport> = {}): HealthReport => ({
  missingEnv: [],
  appliedMigration: LATEST_MIGRATION,
  expectedMigration: LATEST_MIGRATION,
  databaseError: null,
  ...changes,
});
const problems = (changes: Partial<HealthReport>, lastCleanup: { startedAt: Date; ok: boolean } | null = null, builtAt: Date | null = hoursAgo(1)) =>
  healthProblems({ report: report(changes), lastCleanup, builtAt, now: NOW });

describe("healthProblems", () => {
  it("todo en orden: configuración completa, base al día y la limpieza reciente (o una versión recién desplegada)", () => {
    expect(problems({}, { startedAt: hoursAgo(5), ok: true })).toEqual([]);
    expect(problems({}, null, hoursAgo(1))).toEqual([]);
    expect(problems({}, null, null)).toEqual([]);
  });

  it("las variables que faltan", () => {
    expect(problems({ missingEnv: ["CRON_SECRET"] })).toEqual([{ kind: "missing_env", names: ["CRON_SECRET"] }]);
  });

  it("si la base no responde, no se sabe nada más de ella (ni de las migraciones ni de la limpieza)", () => {
    expect(problems({ databaseError: new Error("x"), appliedMigration: null, missingEnv: ["A"] }, { startedAt: hoursAgo(100), ok: false })).toEqual([
      { kind: "missing_env", names: ["A"] },
      { kind: "database" },
    ]);
  });

  it("migraciones que faltan, con cuántas tiene la base; más nuevas que el código no es problema", () => {
    expect(problems({ appliedMigration: null })).toEqual([{ kind: "migrations", applied: 0, expected: MIGRATION_COUNT }]);
    expect(problems({ expectedMigration: LATEST_MIGRATION + 1 })).toEqual([{ kind: "migrations", applied: MIGRATION_COUNT, expected: MIGRATION_COUNT }]);
    expect(problems({ appliedMigration: LATEST_MIGRATION + 1 })).toEqual([]);
  });

  it("la última limpieza falló", () => {
    expect(problems({}, { startedAt: hoursAgo(3), ok: false })).toEqual([{ kind: "cleanup_failed", at: hoursAgo(3) }]);
  });

  it(`la limpieza no corre desde hace más de ${CLEANUP_LATE_HOURS} horas`, () => {
    expect(problems({}, { startedAt: hoursAgo(CLEANUP_LATE_HOURS), ok: true })).toEqual([]);
    expect(problems({}, { startedAt: hoursAgo(CLEANUP_LATE_HOURS + 0.01), ok: true })).toEqual([{ kind: "cleanup_late", since: hoursAgo(CLEANUP_LATE_HOURS + 0.01) }]);
    // Nunca corrió, en una versión desplegada hace más de un día: se mira desde el build.
    expect(problems({}, null, hoursAgo(CLEANUP_LATE_HOURS + 1))).toEqual([{ kind: "cleanup_late", since: null }]);
    // Si además falló, basta con decir eso.
    expect(problems({}, { startedAt: hoursAgo(50), ok: false })).toEqual([{ kind: "cleanup_failed", at: hoursAgo(50) }]);
  });

  it("varios a la vez, de lo más grave a lo menos", () => {
    expect(problems({ missingEnv: ["A"], appliedMigration: null }, { startedAt: hoursAgo(2), ok: false }).map((p) => p.kind)).toEqual([
      "missing_env",
      "migrations",
      "cleanup_failed",
    ]);
  });
});

describe("healthcheckOk", () => {
  it("lo mismo que /api/health: configuración completa y base al día", () => {
    expect(healthcheckOk(report())).toBe(true);
    expect(healthcheckOk(report({ missingEnv: ["A"] }))).toBe(false);
    expect(healthcheckOk(report({ appliedMigration: null }))).toBe(false);
    expect(healthcheckOk(report({ databaseError: "x", appliedMigration: null }))).toBe(false);
  });
});

describe("problemLabel", () => {
  it("cada problema en una frase, en español y en inglés", () => {
    const at = new Date("2026-10-20T09:00:00Z");
    const cases = [
      [{ kind: "missing_env", names: ["CRON_SECRET", "ANTHROPIC_API_KEY o ANTHROPIC_AUTH_TOKEN"] }, "Faltan variables de entorno: CRON_SECRET, ANTHROPIC_API_KEY o ANTHROPIC_AUTH_TOKEN", "Missing environment variables: CRON_SECRET, ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN"],
      [{ kind: "database" }, "La base de datos no responde", "The database isn't responding"],
      [{ kind: "migrations", applied: 21, expected: 24 }, "A la base le faltan migraciones: tiene 21 de 24", "The database is missing migrations: it has 21 of 24"],
      [{ kind: "cleanup_failed", at }, "La última limpieza diaria falló (20 de oct de 2026, 4:00 a. m.)", "The last daily cleanup failed (Oct 20, 2026, 4:00 AM)"],
      [{ kind: "cleanup_late", since: at }, "La limpieza diaria no corre desde el 20 de oct de 2026, 4:00 a. m.", "The daily cleanup hasn't run since Oct 20, 2026, 4:00 AM"],
      [{ kind: "cleanup_late", since: null }, "La limpieza diaria todavía no ha corrido", "The daily cleanup hasn't run yet"],
    ] as const;
    for (const [problem, es, en] of cases) {
      expect(problemLabel(problem).replace(/\s/g, " ")).toBe(es);
      expect(problemLabel(problem, "en").replace(/\s/g, " ")).toBe(en);
    }
  });
});

describe("envNames", () => {
  it("los nombres en una lista; la «o» de Claude, en el idioma de la página", () => {
    expect(envNames(["A", "B o C"])).toBe("A, B o C");
    expect(envNames(["A", "B o C"], "en")).toBe("A, B or C");
  });
});

describe("cronScheduleLabel", () => {
  it("la limpieza de vercel.json: todos los días, a la hora de Colombia (Vercel la programa en UTC)", () => {
    expect(cronScheduleLabel(CLEANUP_PATH)?.replace(/\s/g, " ")).toBe("Todos los días a las 4:00 a. m. (hora de Colombia)");
    expect(cronScheduleLabel(CLEANUP_PATH, "en")?.replace(/\s/g, " ")).toBe("Every day at 4:00 AM (Colombia time)");
  });

  it("otro horario diario, uno que no es diario y una tarea que no está", () => {
    const crons = [
      { path: "/a", schedule: "30 23 * * *" },
      { path: "/b", schedule: "0 9 * * 1" },
    ];
    expect(cronScheduleLabel("/a", "es", crons)?.replace(/\s/g, " ")).toBe("Todos los días a las 6:30 p. m. (hora de Colombia)");
    expect(cronScheduleLabel("/b", "es", crons)).toBe("Cron: 0 9 * * 1");
    expect(cronScheduleLabel("/c", "es", crons)).toBeNull();
  });
});

describe("formatBytes", () => {
  it("en potencias de 1024, como Postgres, con un decimal desde kB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1.023 B");
    expect(formatBytes(1024)).toBe("1 kB");
    expect(formatBytes(8192 * 3 + 512)).toBe("24,5 kB");
    expect(formatBytes(47_395_635)).toBe("45,2 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3 GB");
    expect(formatBytes(2 * 1024 ** 5)).toBe("2.048 TB");
    expect(formatBytes(47_395_635, "en")).toBe("45.2 MB");
  });
});

describe("cleanupResultLabel", () => {
  it("lo que borró, con su plural", () => {
    expect(cleanupResultLabel({ messages: 3, events: 0, transactions: 1 })).toBe("Borró 3 mensajes, 0 eventos y 1 movimiento");
    expect(cleanupResultLabel({ messages: 1, events: 2, transactions: 1500 }, "en")).toBe("Deleted 1 message, 2 events and 1,500 transactions");
  });

  it("nada que borrar, y lo que no conoce no lo nombra", () => {
    expect(cleanupResultLabel({ messages: 0, events: 0, transactions: 0 })).toBe("No había nada para borrar");
    expect(cleanupResultLabel({}, "en")).toBe("There was nothing to delete");
    expect(cleanupResultLabel({ transactions: 2, otra: 5 })).toBe("Borró 2 movimientos");
  });
});
