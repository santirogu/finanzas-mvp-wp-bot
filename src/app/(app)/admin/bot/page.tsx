import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { todayInTimezone } from "@/lib/dates";
import { formatShare } from "@/lib/money";
import { requireAdmin } from "@/lib/session";
import { botAccounts, botActivity, type AccountRow } from "@/modules/admin/bot/bot-activity";
import { botSettingsForAdmin } from "@/modules/admin/bot/bot-settings";
import { pendingResends } from "@/modules/admin/bot/resend";
import { formatCost, PRICES_CHECKED_ON } from "@/modules/bot/pricing";
import {
  ACCOUNT_SORTS,
  ACCOUNT_SORT_LABELS,
  BOT_PATH,
  OUTCOMES,
  OUTCOME_LABELS,
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
import { ADMIN_MAX_ROWS, ADMIN_PAGE_SIZE, ADMIN_TIMEZONE, formatDate, formatDateTime } from "@/modules/admin/shared/filters";
import { PageSkeleton } from "../../page-skeleton";
import { ActiveFilters } from "../active-filters";
import { BotSettings } from "./bot-settings";
import { Connections } from "./connections";
import { ResendReplies } from "./resend-replies";
import { BotFilterBar } from "./filter-bar";

export const metadata: Metadata = { title: "Bot de WhatsApp · Administración" };

// Cómo funciona el bot de WhatsApp: qué pasó con los mensajes, el consumo de Claude y los errores, de
// todas las cuentas. Nunca el texto de los mensajes (la política de privacidad lo promete): las
// consultas de src/modules/admin/bot/bot-activity.ts no lo devuelven. Los filtros vienen en la URL:
// se leen en cada request, dentro de Suspense (Cache Components).
export default function BotPage({ searchParams }: PageProps<"/admin/bot">) {
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
  const filters = parseBotFilters(params);
  const today = todayInTimezone(ADMIN_TIMEZONE);
  const [activity, accounts, settings, resends] = await Promise.all([
    botActivity(filters, today),
    botAccounts(filters, today),
    botSettingsForAdmin(),
    pendingResends(),
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
      <section className="card space-y-4 p-4" aria-labelledby="bot">
        <div className="space-y-1">
          <h2 id="bot" className="font-semibold">
            Bot de WhatsApp
          </h2>
          <p className="text-sm text-muted">
            Todas las cuentas · hora de Colombia. Sin el texto de los mensajes: solo qué pasó con cada uno.
          </p>
        </div>
        {/* key: con otros filtros (o al quitarlos) el formulario empieza de nuevo con lo de la URL. */}
        <BotFilterBar key={`${botHref(filters)}|${panelOpen}`} filters={filters} panelOpen={panelOpen} />
        <ActiveFilters items={activeBotFilters(filters)} clearHref={BOT_PATH} />

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Mensajes" value={formatCount(activity.total)} />
          <Stat label="Registraron movimientos" value={formatCount(only("registrado"))} />
          <Stat label="Errores" value={formatCount(only("error"))} danger={only("error") > 0} />
          <Stat label="Llamadas a Claude" value={formatCount(activity.claude.calls)} />
        </dl>
        {activity.response && (
          <p className="text-sm text-muted">
            Responde en {formatSeconds(activity.response.median)} (la mitad de las veces); el 95 % en menos de{" "}
            {formatSeconds(activity.response.p95)}.
          </p>
        )}
      </section>

      <BotSettings
        claudePaused={settings.claudePaused}
        limits={settings.limits}
        monthlyTokenLimit={settings.monthlyTokenLimit}
        month={{ ...settings.month, resetsOn: formatDayMonth(settings.month.resetsOn) }}
        averageTokensPerCall={settings.averageTokensPerCall}
        lastChange={settings.updated && `${settings.updated.by ?? "Un admin"} · ${formatDateTime(settings.updated.at)}`}
      />
      <Connections />

      <section className="card space-y-3 p-4" aria-labelledby="resultados">
        <div className="space-y-1">
          <h2 id="resultados" className="font-semibold">
            Qué pasó con los mensajes
          </h2>
          {allMessages > 0 && <p className="text-sm text-muted">Toca uno para ver solo esos mensajes (otra vez, para quitarlo).</p>}
        </div>
        {allMessages === 0 ? (
          <p className="text-sm text-muted">{filtered ? "No hay mensajes con estos filtros." : "Todavía no hay mensajes."}</p>
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
                        {OUTCOME_LABELS[o]}
                        {selected && <span className="font-normal text-muted"> · filtrando</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatCount(activity.outcomes[o])} · {formatShare(activity.outcomes[o], allMessages)}%
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

      <Accounts filters={filters} today={today} rows={accounts.rows} hasMore={accounts.hasMore} />

      <section className="card space-y-4 p-4" aria-labelledby="claude">
        <div className="space-y-1">
          <h2 id="claude" className="font-semibold">
            Consumo de Claude
          </h2>
          <p className="text-sm text-muted">
            Cada mensaje en texto libre usa una llamada; los comandos (balance, reporte, deshacer, ayuda) no. El costo es un estimado
            en dólares con los precios públicos de Anthropic del {formatPriceDate(PRICES_CHECKED_ON)}; el cobro real lo ves en
            la consola de Anthropic.
          </p>
        </div>
        {/* Las llamadas ya están arriba. Dos columnas desde 352 px: un total de cientos de millones de
            tokens no cabe en una más angosta (e2e/diseno-tactil.spec.ts); tres desde sm. */}
        <dl className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2 sm:grid-cols-3">
          <Stat label="Tokens de entrada" value={formatCount(activity.claude.inputTokens)} />
          <Stat label="Tokens de salida" value={formatCount(activity.claude.outputTokens)} />
          <Stat label="Costo estimado" value={formatCost(activity.claude.cost.usd)} />
        </dl>
        {activity.claude.cost.unpriced.length > 0 && (
          <p className="text-sm text-muted">
            Sin precio, no suman al costo: {activity.claude.cost.unpriced.join(", ")} (src/modules/bot/pricing.ts).
          </p>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Llamadas por día
            {filters.date === "todo" && <span className="font-normal text-muted"> · últimos 30 días</span>}
          </h3>
          {/* Las barras son para ver la forma; la tabla, para leer los números (y para el lector de pantalla). */}
          <div aria-hidden className="flex h-20 items-end gap-px">
            {activity.claude.byDay.map((d) => (
              <div
                key={d.day}
                title={`${formatShortDay(d.day)}: ${d.calls}`}
                className="flex-1 rounded-t-sm bg-brand/70"
                style={{ height: `${d.calls === 0 ? 2 : Math.max((d.calls / maxCalls) * 100, 6)}%` }}
              />
            ))}
          </div>
          <div aria-hidden className="flex justify-between text-xs text-muted">
            <span>{formatShortDay(activity.claude.byDay[0].day)}</span>
            <span>{formatShortDay(activity.claude.byDay.at(-1)!.day)}</span>
          </div>
          <table className="sr-only">
            <caption>Llamadas a Claude por día</caption>
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Llamadas</th>
              </tr>
            </thead>
            <tbody>
              {activity.claude.byDay.map((d) => (
                <tr key={d.day}>
                  <td>{formatShortDay(d.day)}</td>
                  <td>{d.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {activity.claude.byModel.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Por modelo</h3>
            <ul className="divide-y divide-border text-sm">
              {activity.claude.byModel.map((m) => (
                <li key={m.model} className="flex flex-wrap justify-between gap-x-3 py-2">
                  <span className="break-all font-mono text-xs">{m.model}</span>
                  <span className="tabular-nums text-muted">
                    {formatCount(m.calls)} {m.calls === 1 ? "llamada" : "llamadas"} · {formatCount(m.inputTokens)} de entrada ·{" "}
                    {formatCount(m.outputTokens)} de salida
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Cuentas que llegaron al tope{" "}
            <span className="font-normal text-muted">
              ({formatCount(settings.limits.perHour)} por hora o {formatCount(settings.limits.perDay)} por día)
            </span>
          </h3>
          {activity.capped.length === 0 ? (
            <p className="text-sm text-muted">Ninguna.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {activity.capped.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/admin/usuarios/${account.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate font-medium">{account.name}</span>
                    <span className="block truncate text-xs text-muted">{account.email}</span>
                  </Link>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatCount(account.times)} {account.times === 1 ? "vez" : "veces"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="errores">
        <h2 id="errores" className="font-semibold">
          Errores
        </h2>
        {/* Las de las últimas 24 horas, de todas las cuentas: no dependen de los filtros. */}
        <ResendReplies pending={resends} windowHours={RESEND_WINDOW_HOURS} />
        {activity.errors.length === 0 ? (
          <p className="text-sm text-muted">Sin errores{filtered ? " con estos filtros" : ""}.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {activity.errors.map((e) => {
              const { label, detail } = errorLabel(e.error);
              return (
                <li key={e.error} className="space-y-0.5 py-2">
                  <p className="flex flex-wrap justify-between gap-x-3">
                    <span className="font-medium text-danger">{label}</span>
                    <span className="tabular-nums text-muted">
                      {formatCount(e.times)} {e.times === 1 ? "vez" : "veces"} · {formatCount(e.numbers)}{" "}
                      {e.numbers === 1 ? "número" : "números"}
                    </span>
                  </p>
                  {detail && <p className="break-words text-xs text-muted">{detail}</p>}
                  <p className="text-xs text-muted">La última: {formatDateTime(e.last)}</p>
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
function Accounts({ filters, today, rows, hasMore }: { filters: BotFilters; today: string; rows: AccountRow[]; hasMore: boolean }) {
  // El nombre se queda con lo que sobra; las cifras, con lo justo para su encabezado. En columnas desde
  // md: con seis cifras, a 640 px al nombre le quedaban unos 56 px.
  const columns = "md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5.5rem_5rem_4rem_4.5rem]";
  return (
    <section className="card space-y-3 p-4" aria-labelledby="por-cuenta">
      <div className="space-y-1">
        <h2 id="por-cuenta" className="font-semibold">
          Por cuenta
        </h2>
        <p className="text-sm text-muted">
          Solo cantidades, con los filtros de arriba; el costo, estimado en dólares. Cada nombre lleva a su detalle en Usuarios.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Ninguna cuenta con estos filtros.</p>
      ) : (
        <>
          <nav aria-label="Ordenar por" className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Ordenar por</span>
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
                {ACCOUNT_SORT_LABELS[sort]}
              </Link>
            ))}
          </nav>
          {/* Encabezado solo para la vista: cada cifra ya dice qué es (para el lector de pantalla y en celular). */}
          <div aria-hidden className={`hidden gap-3 border-b border-border pb-2 text-xs text-muted md:grid ${columns}`}>
            <span>Cuenta</span>
            <span className="text-right">Mensajes</span>
            <span className="text-right">Registró</span>
            <span className="text-right">Tokens</span>
            <span className="text-right">Costo</span>
            <span className="text-right">Errores</span>
            <span className="text-right">Último</span>
          </div>
          <ul aria-label="Cuentas" className="divide-y divide-border">
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
                    <span className="block font-medium">Números sin cuenta</span>
                  )}
                  <span className="block truncate text-xs text-muted" title={row.email ?? undefined}>
                    {row.id ? row.email : row.phones === 1 ? "1 número" : `${formatCount(row.phones)} números`}
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted md:contents md:text-foreground">
                  <Figure value={formatCount(row.messages)} label={row.messages === 1 ? "mensaje" : "mensajes"} />
                  <Figure value={formatCount(row.registered)} label="registraron movimientos" />
                  <Figure value={formatCount(row.tokens)} label="tokens" />
                  <Figure value={formatCost(row.cost)} label="costo estimado" before />
                  <Figure value={formatCount(row.errors)} label={row.errors === 1 ? "error" : "errores"} danger={row.errors > 0} />
                  <Figure value={lastSeenLabel(row.last, today)} label="último mensaje" before />
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
                Ver más cuentas
              </Link>
            ) : (
              <p className="text-center text-sm text-muted">Se muestran las {ADMIN_MAX_ROWS} primeras: usa los filtros para ver las demás.</p>
            ))}
        </>
      )}
    </section>
  );
}

/** El día en que se revisaron los precios ("2026-10-19"), como "19 de oct de 2026" (a mediodía en Colombia). */
const formatPriceDate = (day: string) => formatDate(new Date(`${day}T12:00:00-05:00`));

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
