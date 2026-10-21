import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { appliedMigrationCount, MIGRATION_COUNT, migrationName, REQUIRED_ENV, ANTHROPIC_CREDENTIALS } from "@/lib/health";
import { commitUrl, RELEASES_PAGE, releaseOf, type Release } from "@/lib/releases";
import { requireAdmin } from "@/lib/session";
import { formatCount } from "@/modules/admin/bot/bot-filters";
import { CLEANUP_PATH, cleanupResultLabel, cronScheduleLabel, envNames, formatBytes } from "@/modules/admin/health/health-view";
import { recentReleases } from "@/modules/admin/health/releases";
import { databaseDetails, recentCleanupRuns, systemHealth, type SystemHealth } from "@/modules/admin/health/system";
import { formatDate, formatDateTime } from "@/modules/admin/shared/filters";
import { PageSkeleton } from "../../page-skeleton";
import { Connections } from "./connections";
import { adminMetadata } from "../admin-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return adminMetadata("salud");
}

const short = (sha: string) => sha.slice(0, 7);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const TEXTS = texts(
  {
    title: "Salud del sistema",
    intro: "Se revisa al abrir la página, sin datos de nadie: nombres de variables, tamaños y cantidades.",
    allGood: "Todo en orden",
    problems: (n: number) => plural(n, "problema", "problemas"),
    checks: "Revisiones",
    healthcheck: "Healthcheck (/api/health)",
    healthcheckOk: "OK",
    healthcheckFail: "Falla",
    env: "Variables de entorno",
    envOk: (n: number) => `Las ${n} obligatorias están configuradas`,
    envMissing: (names: string) => `Faltan: ${names}`,
    migrations: "Migraciones",
    migrationsOk: (applied: number, total: number) => `Al día: ${applied} de ${total}`,
    migrationsBehind: (applied: number, total: number) => `Faltan: la base tiene ${applied} de ${total}`,
    migrationsUnknown: "Sin datos: la base no responde",
    lastMigration: (name: string) => `La última: ${name}`,
    newerMigration: "La base tiene una migración más nueva que este código (una versión anterior, tras volver atrás).",
    database: "Base de datos",
    responds: (ms: number) => `Responde en ${ms} ms`,
    noResponse: "No responde",
    cleanup: "Limpieza diaria",
    lastRun: (date: string) => `La última corrida: ${date}`,
    lastRunFailed: (date: string) => `La última corrida falló: ${date}`,
    noRuns: "Todavía no hay corridas registradas",
    versionTitle: "Versión",
    commit: "Commit",
    localBuild: "Compilada en local",
    builtAt: "Compilada",
    environment: "Entorno",
    environments: { production: "Producción", preview: "Vista previa", development: "Desarrollo" } as Record<string, string>,
    region: "Región",
    node: "Node.js",
    databaseTitle: "Base de datos",
    databaseIntro: (version: string, size: string) => `Postgres ${version} · ocupa ${size}`,
    databaseUnavailable: "No se pudo consultar la base de datos.",
    tablesCaption: "Tablas de la base, de la más grande a la más chica",
    table: "Tabla",
    rows: "Filas (aprox.)",
    size: "Tamaño",
    cleanupTitle: "Limpieza diaria",
    cleanupIntro: "Borra lo que la política de privacidad dice que no se conserva. Cada corrida queda registrada aquí.",
    runFailed: (error: string) => `Falló: ${error}`,
    noRunsYet: "Todavía no hay corridas registradas: se guardan desde esta versión.",
    deploymentsTitle: "Despliegues recientes",
    deploymentsIntro: "Las últimas releases de GitHub: cada despliegue a producción que salió bien.",
    loadingReleases: "Consultando GitHub…",
    thisVersion: "Esta versión",
    moreChanges: (n: number) => `y ${plural(n, "cambio", "cambios")} más`,
    noRelease: (commit: string) => `Esta versión (${commit}) todavía no tiene release: se publica unos minutos después del despliegue.`,
    githubDown: "No se pudo consultar GitHub.",
    seeOnGithub: "Ver las releases en GitHub",
    noReleases: "Todavía no hay releases.",
  },
  {
    en: {
      title: "System health",
      intro: "Checked when the page opens, without anyone's data: variable names, sizes and counts.",
      allGood: "All good",
      problems: (n) => plural(n, "problem", "problems"),
      checks: "Checks",
      healthcheck: "Healthcheck (/api/health)",
      healthcheckOk: "OK",
      healthcheckFail: "Failing",
      env: "Environment variables",
      envOk: (n) => `The ${n} required ones are set`,
      envMissing: (names) => `Missing: ${names}`,
      migrations: "Migrations",
      migrationsOk: (applied, total) => `Up to date: ${applied} of ${total}`,
      migrationsBehind: (applied, total) => `Missing: the database has ${applied} of ${total}`,
      migrationsUnknown: "No data: the database isn't responding",
      lastMigration: (name) => `The latest: ${name}`,
      newerMigration: "The database has a migration newer than this code (an earlier version, after rolling back).",
      database: "Database",
      responds: (ms) => `Responds in ${ms} ms`,
      noResponse: "Not responding",
      cleanup: "Daily cleanup",
      lastRun: (date) => `Last run: ${date}`,
      lastRunFailed: (date) => `The last run failed: ${date}`,
      noRuns: "No runs recorded yet",
      versionTitle: "Version",
      commit: "Commit",
      localBuild: "Built locally",
      builtAt: "Built",
      environment: "Environment",
      environments: { production: "Production", preview: "Preview", development: "Development" },
      region: "Region",
      node: "Node.js",
      databaseTitle: "Database",
      databaseIntro: (version, size) => `Postgres ${version} · takes up ${size}`,
      databaseUnavailable: "Couldn't query the database.",
      tablesCaption: "Database tables, from largest to smallest",
      table: "Table",
      rows: "Rows (approx.)",
      size: "Size",
      cleanupTitle: "Daily cleanup",
      cleanupIntro: "Deletes what the privacy policy says isn't kept. Each run is recorded here.",
      runFailed: (error) => `Failed: ${error}`,
      noRunsYet: "No runs recorded yet: they're saved starting with this version.",
      deploymentsTitle: "Recent deployments",
      deploymentsIntro: "The latest GitHub releases: each deployment to production that went well.",
      loadingReleases: "Checking GitHub…",
      thisVersion: "This version",
      moreChanges: (n) => `and ${plural(n, "more change", "more changes")}`,
      noRelease: (commit) => `This version (${commit}) doesn't have a release yet: it's published a few minutes after the deployment.`,
      githubDown: "Couldn't check GitHub.",
      seeOnGithub: "See the releases on GitHub",
      noReleases: "There are no releases yet.",
    },
  },
);
type HealthTexts = (typeof TEXTS)[Locale];

/** Cuántos cambios de cada release se muestran. */
const CHANGES_SHOWN = 3;

export default function HealthPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Health />
    </Suspense>
  );
}

async function Health() {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();
  const locale = await getLocale();
  const t = TEXTS[locale];
  const health = await systemHealth();
  const reachable = health.report.databaseError === null;
  const [database, runs] = reachable ? await Promise.all([databaseDetails().catch(() => null), recentCleanupRuns().catch(() => [])]) : [null, []];

  return (
    <div className="space-y-4">
      <Status health={health} t={t} locale={locale} />

      <section className="card space-y-3 p-4" aria-labelledby="version">
        <h2 id="version" className="font-semibold">
          {t.versionTitle}
        </h2>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm min-[22rem]:grid-cols-2 sm:grid-cols-3">
          <Fact label={t.commit}>
            {health.build.commit ? (
              <a href={commitUrl(health.build.commit)} className="font-mono text-brand underline">
                {short(health.build.commit)}
              </a>
            ) : (
              t.localBuild
            )}
          </Fact>
          {health.build.builtAt && <Fact label={t.builtAt}>{formatDateTime(health.build.builtAt, locale)}</Fact>}
          <Fact label={t.environment}>{t.environments[health.build.environment] ?? health.build.environment}</Fact>
          {health.build.region && <Fact label={t.region}>{health.build.region}</Fact>}
          <Fact label={t.node}>{health.build.node}</Fact>
        </dl>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="base">
        <div className="space-y-1">
          <h2 id="base" className="font-semibold">
            {t.databaseTitle}
          </h2>
          {database && <p className="text-sm text-muted">{t.databaseIntro(database.version, formatBytes(database.bytes, locale))}</p>}
        </div>
        {database ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t.tablesCaption}</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    {t.table}
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                    {t.rows}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t.size}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {database.tables.map((table) => (
                  <tr key={table.name}>
                    <th scope="row" className="break-all py-1.5 pr-3 text-left font-mono text-xs font-normal">
                      {table.name}
                    </th>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{formatCount(table.rows, locale)}</td>
                    <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{formatBytes(table.bytes, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm font-medium text-danger">{t.databaseUnavailable}</p>
        )}
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="limpieza">
        <div className="space-y-1">
          <h2 id="limpieza" className="font-semibold">
            {t.cleanupTitle}
          </h2>
          <p className="text-sm text-muted">
            {[cronScheduleLabel(CLEANUP_PATH, locale), t.cleanupIntro].filter(Boolean).join(". ")}
          </p>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">{t.noRunsYet}</p>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((run) => (
              <li key={run.startedAt.toISOString()} className="flex gap-3 py-2 text-sm">
                <Mark ok={run.ok} />
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">{formatDateTime(run.startedAt, locale)}</p>
                  <p className={run.ok ? "text-muted" : "font-medium text-danger"}>
                    {run.ok ? cleanupResultLabel(run.result ?? {}, locale) : t.runFailed(run.error ?? "?")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Connections />

      <Suspense
        fallback={
          <section className="card space-y-1 p-4" aria-labelledby="despliegues">
            <h2 id="despliegues" className="font-semibold">
              {t.deploymentsTitle}
            </h2>
            <p className="text-sm text-muted">{t.loadingReleases}</p>
          </section>
        }
      >
        <Deployments commit={health.build.commit} t={t} locale={locale} />
      </Suspense>
    </div>
  );
}

/** El estado general: todo en orden o cuántos problemas, y cada revisión con su resultado. */
function Status({ health, t, locale }: { health: SystemHealth; t: HealthTexts; locale: Locale }) {
  const { report, problems, lastCleanup } = health;
  const reachable = report.databaseError === null;
  const applied = appliedMigrationCount(report.appliedMigration);
  const lastName = migrationName(report.appliedMigration);
  const cleanupProblem = problems.some((p) => p.kind === "cleanup_failed" || p.kind === "cleanup_late");
  return (
    <section className="card space-y-3 p-4" aria-labelledby="estado">
      <div className="space-y-1">
        <h2 id="estado" className="font-semibold">
          {t.title}
        </h2>
        <p className="text-sm text-muted">{t.intro}</p>
      </div>
      <p className={`flex items-center gap-2 font-semibold ${problems.length === 0 ? "text-income" : "text-danger"}`}>
        <Mark ok={problems.length === 0} />
        {problems.length === 0 ? t.allGood : t.problems(problems.length)}
      </p>
      <ul aria-label={t.checks} className="divide-y divide-border border-t border-border">
        <Check ok={health.healthcheckOk} label={t.healthcheck} value={health.healthcheckOk ? t.healthcheckOk : t.healthcheckFail} />
        <Check
          ok={report.missingEnv.length === 0}
          label={t.env}
          value={report.missingEnv.length === 0 ? t.envOk(REQUIRED_ENV.length + 1) : t.envMissing(envNames(report.missingEnv, locale))}
          detail={report.missingEnv.length === 0 ? envNames([...REQUIRED_ENV, ANTHROPIC_CREDENTIALS.join(" o ")], locale) : null}
        />
        <Check
          ok={reachable ? !problems.some((p) => p.kind === "migrations") : null}
          label={t.migrations}
          value={!reachable ? t.migrationsUnknown : problems.some((p) => p.kind === "migrations") ? t.migrationsBehind(applied, MIGRATION_COUNT) : t.migrationsOk(applied, MIGRATION_COUNT)}
          detail={reachable ? (lastName ? t.lastMigration(lastName) : report.appliedMigration !== null ? t.newerMigration : null) : null}
        />
        <Check ok={health.latencyMs !== null} label={t.database} value={health.latencyMs !== null ? t.responds(health.latencyMs) : t.noResponse} />
        <Check
          ok={!reachable ? null : cleanupProblem ? false : lastCleanup ? true : null}
          label={t.cleanup}
          value={
            lastCleanup
              ? (lastCleanup.ok ? t.lastRun : t.lastRunFailed)(formatDateTime(lastCleanup.startedAt, locale))
              : t.noRuns
          }
        />
      </ul>
    </section>
  );
}

/** Las releases de GitHub, con la que corre marcada. Va aparte (Suspense): si GitHub tarda, el resto de la página ya se ve. */
async function Deployments({ commit, t, locale }: { commit: string | null; t: HealthTexts; locale: Locale }) {
  const result = await recentReleases();
  const current = result.ok ? releaseOf(result.releases, commit) : null;
  return (
    <section className="card space-y-3 p-4" aria-labelledby="despliegues">
      <div className="space-y-1">
        <h2 id="despliegues" className="font-semibold">
          {t.deploymentsTitle}
        </h2>
        <p className="text-sm text-muted">{t.deploymentsIntro}</p>
      </div>
      {!result.ok ? (
        <p className="text-sm">
          <span className="font-medium text-danger">{t.githubDown}</span>{" "}
          <a href={RELEASES_PAGE} className="text-brand underline">
            {t.seeOnGithub}
          </a>
        </p>
      ) : result.releases.length === 0 ? (
        <p className="text-sm text-muted">{t.noReleases}</p>
      ) : (
        <>
          {commit && !current && <p className="text-sm text-muted">{t.noRelease(short(commit))}</p>}
          <ol className="divide-y divide-border">
            {result.releases.map((release) => (
              <ReleaseItem key={release.tag} release={release} current={release === current} t={t} locale={locale} />
            ))}
          </ol>
          <p className="text-sm">
            <a href={RELEASES_PAGE} className="text-brand underline">
              {t.seeOnGithub}
            </a>
          </p>
        </>
      )}
    </section>
  );
}

function ReleaseItem({ release, current, t, locale }: { release: Release; current: boolean; t: HealthTexts; locale: Locale }) {
  const shown = release.changes.slice(0, CHANGES_SHOWN);
  const more = release.changes.length - shown.length;
  return (
    <li className="space-y-1 py-2.5 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <a href={release.url} className="font-medium text-brand underline">
          {release.tag}
        </a>
        <span className="text-muted">{formatDate(new Date(release.publishedAt), locale)}</span>
        {current && <span className="rounded-full bg-income/10 px-2 text-xs font-medium text-income">{t.thisVersion}</span>}
      </p>
      {shown.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-muted">
          {shown.map((change) => (
            <li key={change} className="break-words">
              {change}
            </li>
          ))}
          {more > 0 && <li className="list-none">{t.moreChanges(more)}</li>}
        </ul>
      )}
    </li>
  );
}

function Check({ ok, label, value, detail = null }: { ok: boolean | null; label: string; value: string; detail?: string | null }) {
  return (
    <li className="flex gap-3 py-2.5 text-sm">
      <Mark ok={ok} />
      <div className="min-w-0 space-y-0.5">
        <p>
          <span className="font-medium">{label}:</span> <span className={ok === false ? "font-medium text-danger" : ""}>{value}</span>
        </p>
        {detail && <p className="break-words text-xs text-muted">{detail}</p>}
      </div>
    </li>
  );
}

/** ✓ en verde, ✕ en rojo o – en gris (sin datos). Solo visual: el texto de al lado dice lo mismo. */
function Mark({ ok }: { ok: boolean | null }) {
  const [symbol, tone] = ok === null ? ["–", "bg-background text-muted"] : ok ? ["✓", "bg-income/10 text-income"] : ["✕", "bg-danger/10 text-danger"];
  return (
    <span aria-hidden className={`mt-0.5 flex size-5 flex-none items-center justify-center rounded-full text-xs font-bold ${tone}`}>
      {symbol}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
