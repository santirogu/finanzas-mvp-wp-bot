import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from "@/i18n/locales";
import { appliedMigrationCount, migrationsUpToDate, MIGRATION_COUNT, type HealthReport } from "@/lib/health";
import { formatDateTime, formatHour } from "@/modules/admin/shared/filters";
import vercel from "../../../../vercel.json";

// Lo que se decide y se lee en /admin/salud, sin base de datos: qué cuenta como problema (también para
// la tarjeta del Inicio del admin), cuándo corre la limpieza y cómo se leen los tamaños y sus resultados.

/** Desde cuántas horas sin correr la limpieza diaria es un problema: un día y un margen (Vercel Cron puede correrla dentro de su hora). */
export const CLEANUP_LATE_HOURS = 26;

export type CleanupRunSummary = { startedAt: Date; ok: boolean };

/** Cuántas corridas de la limpieza se muestran. */
export const CLEANUP_RUNS_SHOWN = 7;

export type HealthProblem =
  | { kind: "missing_env"; names: readonly string[] }
  | { kind: "database" }
  | { kind: "migrations"; applied: number; expected: number }
  | { kind: "cleanup_failed"; at: Date }
  /** `since`: la última corrida; null si nunca corrió desde que se guardan (y la versión ya lleva más de un día). */
  | { kind: "cleanup_late"; since: Date | null };

/** Si /api/health respondería "ok": la configuración completa y la base al día. */
export const healthcheckOk = (report: HealthReport) => report.missingEnv.length === 0 && migrationsUpToDate(report);

/**
 * Los problemas, de lo más grave a lo menos. La limpieza se mira desde su última corrida o, si todavía no
 * hay ninguna, desde el build (una versión recién desplegada no tiene por qué haberla corrido aún).
 */
export function healthProblems({
  report,
  lastCleanup,
  builtAt,
  now,
}: {
  report: HealthReport;
  lastCleanup: CleanupRunSummary | null;
  builtAt: Date | null;
  now: Date;
}): HealthProblem[] {
  const problems: HealthProblem[] = [];
  if (report.missingEnv.length > 0) problems.push({ kind: "missing_env", names: report.missingEnv });
  if (report.databaseError !== null) return [...problems, { kind: "database" }];
  if (!migrationsUpToDate(report)) {
    problems.push({ kind: "migrations", applied: appliedMigrationCount(report.appliedMigration), expected: MIGRATION_COUNT });
  }
  const since = lastCleanup?.startedAt ?? builtAt;
  if (lastCleanup && !lastCleanup.ok) problems.push({ kind: "cleanup_failed", at: lastCleanup.startedAt });
  else if (since && now.getTime() - since.getTime() > CLEANUP_LATE_HOURS * 3_600_000) {
    problems.push({ kind: "cleanup_late", since: lastCleanup?.startedAt ?? null });
  }
  return problems;
}

const PROBLEM_TEXTS = {
  es: {
    missing_env: (names: string) => `Faltan variables de entorno: ${names}`,
    database: "La base de datos no responde",
    migrations: (applied: number, expected: number) => `A la base le faltan migraciones: tiene ${applied} de ${expected}`,
    cleanup_failed: (at: string) => `La última limpieza diaria falló (${at})`,
    cleanup_late: (since: string) => `La limpieza diaria no corre desde el ${since}`,
    cleanup_never: "La limpieza diaria todavía no ha corrido",
  },
  en: {
    missing_env: (names: string) => `Missing environment variables: ${names}`,
    database: "The database isn't responding",
    migrations: (applied: number, expected: number) => `The database is missing migrations: it has ${applied} of ${expected}`,
    cleanup_failed: (at: string) => `The last daily cleanup failed (${at})`,
    cleanup_late: (since: string) => `The daily cleanup hasn't run since ${since}`,
    cleanup_never: "The daily cleanup hasn't run yet",
  },
} as const satisfies Record<Locale, unknown>;

/** Los nombres de las variables, en una lista: la de Claude es "ANTHROPIC_API_KEY o ANTHROPIC_AUTH_TOKEN" (en inglés, "or"). */
export const envNames = (names: readonly string[], locale: Locale = DEFAULT_LOCALE) =>
  names.map((name) => (locale === "es" ? name : name.replace(" o ", " or "))).join(", ");

/** Un problema en una frase, en el idioma de la página. */
export function problemLabel(problem: HealthProblem, locale: Locale = DEFAULT_LOCALE): string {
  const t = PROBLEM_TEXTS[locale];
  switch (problem.kind) {
    case "missing_env":
      return t.missing_env(envNames(problem.names, locale));
    case "database":
      return t.database;
    case "migrations":
      return t.migrations(problem.applied, problem.expected);
    case "cleanup_failed":
      return t.cleanup_failed(formatDateTime(problem.at, locale));
    case "cleanup_late":
      return problem.since ? t.cleanup_late(formatDateTime(problem.since, locale)) : t.cleanup_never;
  }
}

/** La ruta de la limpieza diaria, como está en vercel.json. */
export const CLEANUP_PATH = "/api/cron/limpieza";

/**
 * Cuándo corre una tarea de Vercel Cron: "Todos los días a las 4:00 a. m. (hora de Colombia)". Vercel la
 * programa en UTC. Un horario que no es diario se muestra tal cual; null si la tarea no está en vercel.json.
 */
export function cronScheduleLabel(path: string, locale: Locale = DEFAULT_LOCALE, crons: readonly { path: string; schedule: string }[] = vercel.crons): string | null {
  const schedule = crons.find((cron) => cron.path === path)?.schedule;
  if (!schedule) return null;
  const daily = schedule.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (!daily) return `Cron: ${schedule}`;
  const hour = formatHour(new Date(Date.UTC(2026, 0, 1, Number(daily[2]), Number(daily[1]))), locale);
  return locale === "es" ? `Todos los días a las ${hour} (hora de Colombia)` : `Every day at ${hour} (Colombia time)`;
}

const BYTE_UNITS = ["B", "kB", "MB", "GB", "TB"];

/** Un tamaño como lo muestra Postgres (en potencias de 1024): "45,2 MB" (en inglés, "45.2 MB"). */
export function formatBytes(bytes: number, locale: Locale = DEFAULT_LOCALE): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const number = new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
  return `${number} ${BYTE_UNITS[unit]}`;
}

const CLEANUP_TEXTS = {
  es: {
    units: { messages: ["mensaje", "mensajes"], events: ["evento", "eventos"], transactions: ["movimiento", "movimientos"] },
    deleted: (parts: string) => `Borró ${parts}`,
    and: " y ",
    nothing: "No había nada para borrar",
  },
  en: {
    units: { messages: ["message", "messages"], events: ["event", "events"], transactions: ["transaction", "transactions"] },
    deleted: (parts: string) => `Deleted ${parts}`,
    and: " and ",
    nothing: "There was nothing to delete",
  },
} as const satisfies Record<Locale, unknown>;

/** Lo que borró una corrida de la limpieza: "Borró 3 mensajes, 0 eventos y 1 movimiento". */
export function cleanupResultLabel(result: Record<string, number>, locale: Locale = DEFAULT_LOCALE): string {
  const t = CLEANUP_TEXTS[locale];
  const counts = (Object.keys(t.units) as (keyof typeof t.units)[]).filter((key) => key in result).map((key) => [key, result[key]] as const);
  if (counts.every(([, n]) => n === 0)) return t.nothing;
  const parts = counts.map(([key, n]) => `${new Intl.NumberFormat(INTL_LOCALES[locale]).format(n)} ${t.units[key][n === 1 ? 0 : 1]}`);
  return t.deleted(parts.length > 1 ? `${parts.slice(0, -1).join(", ")}${t.and}${parts.at(-1)}` : parts.join(""));
}
