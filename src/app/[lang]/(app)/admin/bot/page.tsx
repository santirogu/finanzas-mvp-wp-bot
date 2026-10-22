import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotCommandsText } from "@/components/bot-commands-text";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { todayInTimezone } from "@/lib/dates";
import { formatPercent, formatShare } from "@/lib/money";
import { requireAdmin } from "@/lib/session";
import { botAlerts } from "@/modules/admin/bot/alerts";
import { botAccounts, botActivity, type AccountRow } from "@/modules/admin/bot/bot-activity";
import { botSettingsForAdmin } from "@/modules/admin/bot/bot-settings";
import { pendingResends } from "@/modules/admin/bot/resend";
import { BOT_MODELS_EVALUATED_ON } from "@/modules/bot/models";
import { formatCost, PRICES_CHECKED_ON } from "@/modules/bot/pricing";
import {
  ACCOUNT_SORTS,
  ACCOUNT_SORT_TEXTS,
  BOT_PATH,
  OUTCOMES,
  OUTCOME_TEXTS,
  PROBLEM_OUTCOMES,
  RESEND_WINDOW_HOURS,
  activeBotFilters,
  botHref,
  errorLabel,
  formatCount,
  formatDayMonth,
  formatSeconds,
  formatShortDay,
  lastSeenLabel,
  parseBotFilters,
  showMoreAccounts,
  toggleOutcome,
  type BotFilters,
} from "@/modules/admin/bot/bot-filters";
import { adminModuleLabel } from "@/modules/admin/modules";
import { ADMIN_MAX_ROWS, ADMIN_PAGE_SIZE, ADMIN_TIMEZONE, formatDate, formatDateTime } from "@/modules/admin/shared/filters";
import { BotAlerts } from "../bot-alerts";
import { PageSkeleton } from "../../page-skeleton";
import { ActiveFilters } from "../active-filters";
import { BotSettings } from "./bot-settings";
import { ResendReplies } from "./resend-replies";
import { BotFilterBar } from "./filter-bar";
import { adminMetadata } from "../admin-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return adminMetadata("bot");
}

// Los comandos (balance, reporte, deshacer, ayuda) van como se escriben en el bot, que responde en español.
const TEXTS = texts(
  {
    title: "Bot de WhatsApp",
    intro: "Todas las cuentas · hora de Colombia. Sin el texto de los mensajes: solo qué pasó con cada uno.",
    messages: "Mensajes",
    recorded: "Registraron movimientos",
    errors: "Errores",
    calls: "Llamadas a Claude",
    response: (median: string, p95: string) => `La mitad de las veces responde en menos de ${median}; el ${formatPercent(95, "es")}, en menos de ${p95}.`,
    someAdmin: "Un admin",
    outcomesTitle: "Qué pasó con los mensajes",
    outcomesHint: "Toca uno para ver solo esos mensajes (otra vez, para quitarlo).",
    noneFiltered: "No hay mensajes con estos filtros.",
    none: "Todavía no hay mensajes.",
    filtering: " · filtrando",
    claudeTitle: "Consumo de Claude",
    claudeIntro: (date: string) =>
      `Cada mensaje en texto libre usa una llamada; los comandos (balance, reporte, deshacer, ayuda) no. El costo es un estimado en dólares con los precios públicos de Anthropic del ${date}; el cobro real lo ves en la consola de Anthropic.`,
    inputTokens: "Tokens de entrada",
    outputTokens: "Tokens de salida",
    cost: "Costo estimado",
    unpriced: (models: string) => `Sin precio, no suman al costo: ${models} (src/modules/bot/pricing.ts).`,
    perDay: "Llamadas por día",
    last30: " · últimos 30 días",
    tableCaption: "Llamadas a Claude por día",
    day: "Día",
    callsColumn: "Llamadas",
    byModel: "Por modelo",
    modelLine: (n: number, calls: string, input: string, output: string) =>
      `${calls} ${n === 1 ? "llamada" : "llamadas"} · ${input} de entrada · ${output} de salida`,
    capped: "Cuentas que llegaron al tope",
    cappedLimits: (perHour: string, perDay: string) => `(${perHour} por hora o ${perDay} por día)`,
    noneCapped: "Ninguna.",
    times: (n: number, count: string) => `${count} ${n === 1 ? "vez" : "veces"}`,
    noErrors: (filtered: boolean) => `Sin errores${filtered ? " con estos filtros" : ""}.`,
    numbers: (n: number, count: string) => `${count} ${n === 1 ? "número" : "números"}`,
    lastError: (date: string) => `La última: ${date}`,
    byAccount: "Por cuenta",
    byAccountIntro: "Solo cantidades, con los filtros de arriba; el costo, estimado en dólares. Cada nombre lleva a su detalle en Usuarios.",
    noAccounts: "Ninguna cuenta con estos filtros.",
    sortBy: "Ordenar por",
    columns: { account: "Cuenta", messages: "Mensajes", registered: "Registró", tokens: "Tokens", cost: "Costo", errors: "Errores", last: "Último" },
    accounts: "Cuentas",
    noAccount: "Números sin cuenta",
    phones: (n: number, count: string): string => (n === 1 ? "1 número" : `${count} números`),
    figures: {
      messages: (n: number): string => (n === 1 ? "mensaje" : "mensajes"),
      registered: "registraron movimientos",
      tokens: "tokens",
      cost: "costo estimado",
      errors: (n: number): string => (n === 1 ? "error" : "errores"),
      last: "último mensaje",
    },
    moreAccounts: "Ver más cuentas",
    maxAccounts: (n: number) => `Se muestran las ${n} primeras: usa los filtros para ver las demás.`,
    connections: "Las conexiones con WhatsApp y Claude se prueban en",
  },
  {
    en: {
      title: "WhatsApp bot",
      intro: "Every account · Colombia time. Without the text of the messages: only what happened with each one.",
      messages: "Messages",
      recorded: "Added transactions",
      errors: "Errors",
      calls: "Claude calls",
      response: (median, p95) => `Half of the time it answers in under ${median}; 95%, in under ${p95}.`,
      someAdmin: "An admin",
      outcomesTitle: "What happened with the messages",
      outcomesHint: "Tap one to see only those messages (again, to remove it).",
      noneFiltered: "There are no messages with these filters.",
      none: "There are no messages yet.",
      filtering: " · filtering",
      claudeTitle: "Claude usage",
      claudeIntro: (date) =>
        `Each free-text message uses one call; the commands (balance, reporte, deshacer, ayuda) don't. The cost is an estimate in US dollars with Anthropic's public prices as of ${date}; you see the actual charge in the Anthropic console.`,
      inputTokens: "Input tokens",
      outputTokens: "Output tokens",
      cost: "Estimated cost",
      unpriced: (models) => `No price, so not added to the cost: ${models} (src/modules/bot/pricing.ts).`,
      perDay: "Calls per day",
      last30: " · last 30 days",
      tableCaption: "Claude calls per day",
      day: "Day",
      callsColumn: "Calls",
      byModel: "By model",
      modelLine: (n, calls, input, output) => `${calls} ${n === 1 ? "call" : "calls"} · ${input} input · ${output} output`,
      capped: "Accounts that hit the limit",
      cappedLimits: (perHour, perDay) => `(${perHour} per hour or ${perDay} per day)`,
      noneCapped: "None.",
      times: (n, count) => `${count} ${n === 1 ? "time" : "times"}`,
      noErrors: (filtered) => `No errors${filtered ? " with these filters" : ""}.`,
      numbers: (n, count) => `${count} ${n === 1 ? "number" : "numbers"}`,
      lastError: (date) => `The last one: ${date}`,
      byAccount: "By account",
      byAccountIntro: "Only counts, with the filters above; the cost, estimated in US dollars. Each name leads to its detail in Users.",
      noAccounts: "No accounts with these filters.",
      sortBy: "Sort by",
      columns: { account: "Account", messages: "Messages", registered: "Added", tokens: "Tokens", cost: "Cost", errors: "Errors", last: "Last" },
      accounts: "Accounts",
      noAccount: "Numbers without an account",
      phones: (n, count) => (n === 1 ? "1 number" : `${count} numbers`),
      figures: {
        messages: (n) => (n === 1 ? "message" : "messages"),
        registered: "added transactions",
        tokens: "tokens",
        cost: "estimated cost",
        errors: (n) => (n === 1 ? "error" : "errors"),
        last: "last message",
      },
      moreAccounts: "See more accounts",
      maxAccounts: (n) => `The first ${n} are shown: use the filters to see the rest.`,
      connections: "The connections to WhatsApp and Claude are tested in",
    },
  },
);

type Texts = (typeof TEXTS)["es"];

// Cómo funciona el bot de WhatsApp: qué pasó con los mensajes, el consumo de Claude y los errores, de
// todas las cuentas. Nunca el texto de los mensajes (la política de privacidad lo promete): las
// consultas de src/modules/admin/bot/bot-activity.ts no lo devuelven. Los filtros vienen en la URL:
// se leen en cada request, dentro de Suspense (Cache Components).
export default function BotPage({ searchParams }: PageProps<"/[lang]/admin/bot">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <Bot params={params} />
      ))}
    </Suspense>
  );
}

async function Bot({ params }: { params: Record<string, string | string[] | undefined> }) {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();
  const locale = await getLocale();
  const t = TEXTS[locale];
  const count = (n: number) => formatCount(n, locale);
  const filters = parseBotFilters(params);
  const today = todayInTimezone(ADMIN_TIMEZONE);
  const [activity, accounts, settings, resends, alerts] = await Promise.all([
    botActivity(filters, today),
    botAccounts(filters, today),
    botSettingsForAdmin(),
    pendingResends(),
    botAlerts(),
  ]);
  const panelOpen = params.panel === "1";
  const filtered = activeBotFilters(filters).length > 0;
  const maxCalls = Math.max(1, ...activity.claude.byDay.map((d) => d.calls));
  const shown = OUTCOMES.filter((o) => activity.outcomes[o] > 0);
  // Las barras muestran todos los resultados; las cifras de arriba, solo el que se tocó.
  const allMessages = OUTCOMES.reduce((sum, o) => sum + activity.outcomes[o], 0);
  const only = (o: (typeof OUTCOMES)[number]) => (filters.outcome && filters.outcome !== o ? 0 : activity.outcomes[o]);

  return (
    <div className="space-y-4">
      <BotAlerts alerts={alerts} locale={locale} />
      <section className="card space-y-4 p-4" aria-labelledby="bot">
        <div className="space-y-1">
          <h2 id="bot" className="font-semibold">
            {t.title}
          </h2>
          <p className="text-sm text-muted">{t.intro}</p>
        </div>
        {/* key: con otros filtros (o al quitarlos) el formulario empieza de nuevo con lo de la URL. */}
        <BotFilterBar key={`${botHref(filters)}|${panelOpen}`} filters={filters} panelOpen={panelOpen} />
        <ActiveFilters items={activeBotFilters(filters, locale)} clearHref={BOT_PATH} locale={locale} />

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t.messages} value={count(activity.total)} />
          <Stat label={t.recorded} value={count(only("registrado"))} />
          <Stat label={t.errors} value={count(only("error"))} danger={only("error") > 0} />
          <Stat label={t.calls} value={count(activity.claude.calls)} />
        </dl>
        {activity.response && (
          <p className="text-sm text-muted">
            {t.response(formatSeconds(activity.response.median, locale), formatSeconds(activity.response.p95, locale))}
          </p>
        )}
      </section>

      <BotSettings
        claudePaused={settings.claudePaused}
        limits={settings.limits}
        monthlyTokenLimit={settings.monthlyTokenLimit}
        month={{ ...settings.month, resetsOn: formatDayMonth(settings.month.resetsOn, locale) }}
        averageTokensPerCall={settings.averageTokensPerCall}
        averageUsage={settings.averageUsage}
        model={settings.model.id}
        modelsEvaluatedOn={formatPriceDate(BOT_MODELS_EVALUATED_ON, locale)}
        lastChange={settings.updated && `${settings.updated.by ?? t.someAdmin} · ${formatDateTime(settings.updated.at, locale)}`}
      />
      <p className="px-1 text-sm text-muted">
        {t.connections}{" "}
        <Link href="/admin/salud" className="text-brand underline">
          {adminModuleLabel("salud", locale)}
        </Link>
        .
      </p>

      <section className="card space-y-3 p-4" aria-labelledby="resultados">
        <div className="space-y-1">
          <h2 id="resultados" className="font-semibold">
            {t.outcomesTitle}
          </h2>
          {allMessages > 0 && <p className="text-sm text-muted">{t.outcomesHint}</p>}
        </div>
        {allMessages === 0 ? (
          <p className="text-sm text-muted">{filtered ? t.noneFiltered : t.none}</p>
        ) : (
          <ul className="space-y-1">
            {shown.map((o) => {
              const problem = PROBLEM_OUTCOMES.includes(o);
              const selected = filters.outcome === o;
              return (
                <li key={o}>
                  <Link
                    href={botHref(toggleOutcome(filters, o))}
                    scroll={false}
                    aria-current={selected ? "true" : undefined}
                    className={`-mx-2 block rounded-lg px-2 py-1.5 transition hover:bg-background ${
                      selected ? (problem ? "bg-danger/10 ring-1 ring-danger/40" : "bg-brand/10 ring-1 ring-brand/40") : ""
                    }`}
                  >
                    <span className="flex justify-between gap-2 text-sm">
                      <span className={problem ? "font-medium text-danger" : selected ? "font-medium" : ""}>
                        <BotCommandsText text={OUTCOME_TEXTS[locale][o]} locale={locale} />
                        {selected && <span className="font-normal text-muted">{t.filtering}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {count(activity.outcomes[o])} · {formatPercent(formatShare(activity.outcomes[o], allMessages), locale)}
                      </span>
                    </span>
                    <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-background">
                      <span
                        className={`block h-full rounded-full ${problem ? "bg-danger" : "bg-brand"}`}
                        style={{ width: `${Math.max(Math.round((activity.outcomes[o] / allMessages) * 100), 2)}%` }}
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Accounts filters={filters} today={today} rows={accounts.rows} hasMore={accounts.hasMore} t={t} locale={locale} />

      <section className="card space-y-4 p-4" aria-labelledby="claude">
        <div className="space-y-1">
          <h2 id="claude" className="font-semibold">
            {t.claudeTitle}
          </h2>
          <p className="text-sm text-muted">
            <BotCommandsText text={t.claudeIntro(formatPriceDate(PRICES_CHECKED_ON, locale))} locale={locale} />
          </p>
        </div>
        {/* Las llamadas ya están arriba. Dos columnas desde 352 px: un total de cientos de millones de
            tokens no cabe en una más angosta (e2e/diseno-tactil.spec.ts); tres desde sm. */}
        <dl className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2 sm:grid-cols-3">
          <Stat label={t.inputTokens} value={count(activity.claude.inputTokens)} />
          <Stat label={t.outputTokens} value={count(activity.claude.outputTokens)} />
          <Stat label={t.cost} value={formatCost(activity.claude.cost.usd, locale)} />
        </dl>
        {activity.claude.cost.unpriced.length > 0 && (
          <p className="text-sm text-muted">{t.unpriced(activity.claude.cost.unpriced.join(", "))}</p>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            {t.perDay}
            {filters.date === "todo" && <span className="font-normal text-muted">{t.last30}</span>}
          </h3>
          {/* Las barras son para ver la forma; la tabla, para leer los números (y para el lector de pantalla). */}
          <div aria-hidden className="flex h-20 items-end gap-px">
            {activity.claude.byDay.map((d) => (
              <div
                key={d.day}
                title={`${formatShortDay(d.day, locale)}: ${d.calls}`}
                className="flex-1 rounded-t-sm bg-brand/70"
                style={{ height: `${d.calls === 0 ? 2 : Math.max((d.calls / maxCalls) * 100, 6)}%` }}
              />
            ))}
          </div>
          <div aria-hidden className="flex justify-between text-xs text-muted">
            <span>{formatShortDay(activity.claude.byDay[0].day, locale)}</span>
            <span>{formatShortDay(activity.claude.byDay.at(-1)!.day, locale)}</span>
          </div>
          <table className="sr-only">
            <caption>{t.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.day}</th>
                <th scope="col">{t.callsColumn}</th>
              </tr>
            </thead>
            <tbody>
              {activity.claude.byDay.map((d) => (
                <tr key={d.day}>
                  <td>{formatShortDay(d.day, locale)}</td>
                  <td>{d.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {activity.claude.byModel.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t.byModel}</h3>
            <ul className="divide-y divide-border text-sm">
              {activity.claude.byModel.map((m) => (
                <li key={m.model} className="flex flex-wrap justify-between gap-x-3 py-2">
                  <span className="break-all font-mono text-xs">{m.model}</span>
                  <span className="tabular-nums text-muted">
                    {t.modelLine(m.calls, count(m.calls), count(m.inputTokens), count(m.outputTokens))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            {t.capped}{" "}
            <span className="font-normal text-muted">{t.cappedLimits(count(settings.limits.perHour), count(settings.limits.perDay))}</span>
          </h3>
          {activity.capped.length === 0 ? (
            <p className="text-sm text-muted">{t.noneCapped}</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {activity.capped.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/admin/usuarios/${account.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate font-medium">{account.name}</span>
                    <span className="block truncate text-xs text-muted">{account.email}</span>
                  </Link>
                  <span className="shrink-0 tabular-nums text-muted">{t.times(account.times, count(account.times))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="errores">
        <h2 id="errores" className="font-semibold">
          {t.errors}
        </h2>
        {/* Las de las últimas 24 horas, de todas las cuentas: no dependen de los filtros. */}
        <ResendReplies pending={resends} windowHours={RESEND_WINDOW_HOURS} />
        {activity.errors.length === 0 ? (
          <p className="text-sm text-muted">{t.noErrors(filtered)}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {activity.errors.map((e) => {
              const { label, detail } = errorLabel(e.error, locale);
              return (
                <li key={e.error} className="space-y-0.5 py-2">
                  <p className="flex flex-wrap justify-between gap-x-3">
                    <span className="font-medium text-danger">{label}</span>
                    <span className="tabular-nums text-muted">
                      {t.times(e.times, count(e.times))} · {t.numbers(e.numbers, count(e.numbers))}
                    </span>
                  </p>
                  {detail && <p className="break-words text-xs text-muted">{detail}</p>}
                  <p className="text-xs text-muted">{t.lastError(formatDateTime(e.last, locale))}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg bg-background px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${danger ? "text-danger" : ""}`}>{value}</dd>
    </div>
  );
}

/** "Por cuenta": una fila por cuenta (en celular, las cifras con su nombre; desde sm, en columnas). */
function Accounts({
  filters,
  today,
  rows,
  hasMore,
  t,
  locale,
}: {
  filters: BotFilters;
  today: string;
  rows: AccountRow[];
  hasMore: boolean;
  t: Texts;
  locale: Locale;
}) {
  const count = (n: number) => formatCount(n, locale);
  // El nombre se queda con lo que sobra; las cifras, con lo justo para su encabezado. En columnas desde
  // md: con seis cifras, a 640 px al nombre le quedaban unos 56 px.
  const columns = "md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem_5rem_4rem_4.5rem]";
  return (
    <section className="card space-y-3 p-4" aria-labelledby="por-cuenta">
      <div className="space-y-1">
        <h2 id="por-cuenta" className="font-semibold">
          {t.byAccount}
        </h2>
        <p className="text-sm text-muted">{t.byAccountIntro}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t.noAccounts}</p>
      ) : (
        <>
          <nav aria-label={t.sortBy} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t.sortBy}</span>
            {ACCOUNT_SORTS.map((sort) => (
              <Link
                key={sort}
                href={botHref({ ...filters, sort, limit: ADMIN_PAGE_SIZE })}
                scroll={false}
                aria-current={filters.sort === sort ? "true" : undefined}
                className={`rounded-full border px-3 py-1 ${
                  filters.sort === sort ? "border-brand/50 bg-brand/10 font-medium" : "border-border text-muted hover:bg-background"
                }`}
              >
                {ACCOUNT_SORT_TEXTS[locale][sort]}
              </Link>
            ))}
          </nav>
          {/* Encabezado solo para la vista: cada cifra ya dice qué es (para el lector de pantalla y en celular). */}
          <div aria-hidden className={`hidden gap-3 border-b border-border pb-2 text-xs text-muted md:grid ${columns}`}>
            <span>{t.columns.account}</span>
            <span className="text-right">{t.columns.messages}</span>
            <span className="text-right">{t.columns.registered}</span>
            <span className="text-right">{t.columns.tokens}</span>
            <span className="text-right">{t.columns.cost}</span>
            <span className="text-right">{t.columns.errors}</span>
            <span className="text-right">{t.columns.last}</span>
          </div>
          <ul aria-label={t.accounts} className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id ?? "sin-cuenta"} className={`grid grid-cols-1 gap-x-3 gap-y-1 py-2.5 text-sm ${columns}`}>
                <span className="min-w-0">
                  {row.id ? (
                    <Link
                      href={`/admin/usuarios/${row.id}`}
                      title={row.name ?? undefined}
                      className="block truncate font-medium text-brand hover:underline"
                    >
                      {row.name}
                    </Link>
                  ) : (
                    <span className="block font-medium">{t.noAccount}</span>
                  )}
                  <span className="block truncate text-xs text-muted" title={row.email ?? undefined}>
                    {row.id ? row.email : t.phones(row.phones, count(row.phones))}
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted md:contents md:text-foreground">
                  <Figure value={count(row.messages)} label={t.figures.messages(row.messages)} />
                  <Figure value={count(row.registered)} label={t.figures.registered} />
                  <Figure value={count(row.tokens)} label={t.figures.tokens} />
                  <Figure value={formatCost(row.cost, locale)} label={t.figures.cost} before />
                  <Figure value={count(row.errors)} label={t.figures.errors(row.errors)} danger={row.errors > 0} />
                  <Figure value={lastSeenLabel(row.last, today, locale)} label={t.figures.last} before />
                </span>
              </li>
            ))}
          </ul>
          {hasMore &&
            (filters.limit < ADMIN_MAX_ROWS ? (
              <Link
                href={botHref(showMoreAccounts(filters))}
                scroll={false}
                className="block rounded-lg border border-border py-2 text-center text-sm font-medium hover:bg-background"
              >
                {t.moreAccounts}
              </Link>
            ) : (
              <p className="text-center text-sm text-muted">{t.maxAccounts(ADMIN_MAX_ROWS)}</p>
            ))}
        </>
      )}
    </section>
  );
}

/** El día en que se revisaron los precios ("2026-10-19"), como "19 de oct. de 2026" (a mediodía en Colombia). */
const formatPriceDate = (day: string, locale: Locale) => formatDate(new Date(`${day}T12:00:00-05:00`), locale);

/** Una cifra de "Por cuenta": en celular, con su nombre a la vista ("14 mensajes"); desde md, solo para el lector. */
function Figure({ value, label, danger = false, before = false }: { value: string; label: string; danger?: boolean; before?: boolean }) {
  const name = <span className="md:sr-only">{before ? `${label}: ` : ` ${label}`}</span>;
  return (
    <span className={`tabular-nums md:text-right ${danger ? "font-medium text-danger" : ""}`}>
      {before && name}
      {value}
      {!before && name}
    </span>
  );
}
