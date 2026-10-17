import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { todayInTimezone } from "@/lib/dates";
import { formatShare } from "@/lib/money";
import { requireAdmin } from "@/lib/session";
import { botActivity } from "@/modules/admin/bot/bot-activity";
import { botSettingsForAdmin } from "@/modules/admin/bot/bot-settings";
import {
  BOT_PATH,
  OUTCOMES,
  OUTCOME_LABELS,
  PROBLEM_OUTCOMES,
  activeBotFilters,
  botHref,
  errorLabel,
  formatCount,
  formatSeconds,
  formatShortDay,
  parseBotFilters,
} from "@/modules/admin/bot/bot-filters";
import { ADMIN_TIMEZONE, formatDateTime } from "@/modules/admin/shared/filters";
import { PageSkeleton } from "../../page-skeleton";
import { ActiveFilters } from "../active-filters";
import { BotSettings } from "./bot-settings";
import { Connections } from "./connections";
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
  const [activity, settings] = await Promise.all([botActivity(filters, today), botSettingsForAdmin()]);
  const panelOpen = params.panel === "1";
  const filtered = activeBotFilters(filters).length > 0;
  const maxCalls = Math.max(1, ...activity.claude.byDay.map((d) => d.calls));
  const shown = OUTCOMES.filter((o) => activity.outcomes[o] > 0);

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
          <Stat label="Registraron movimientos" value={formatCount(activity.outcomes.registrado)} />
          <Stat label="Errores" value={formatCount(activity.outcomes.error)} danger={activity.outcomes.error > 0} />
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
        lastChange={settings.updated && `${settings.updated.by ?? "Un admin"} · ${formatDateTime(settings.updated.at)}`}
      />
      <Connections />

      <section className="card space-y-3 p-4" aria-labelledby="resultados">
        <h2 id="resultados" className="font-semibold">
          Qué pasó con los mensajes
        </h2>
        {activity.total === 0 ? (
          <p className="text-sm text-muted">{filtered ? "No hay mensajes con estos filtros." : "Todavía no hay mensajes."}</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((o) => {
              const problem = PROBLEM_OUTCOMES.includes(o);
              return (
                <li key={o}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className={problem ? "font-medium text-danger" : ""}>{OUTCOME_LABELS[o]}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCount(activity.outcomes[o])} · {formatShare(activity.outcomes[o], activity.total)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background">
                    <div
                      className={`h-full rounded-full ${problem ? "bg-danger" : "bg-brand"}`}
                      style={{ width: `${Math.max(Math.round((activity.outcomes[o] / activity.total) * 100), 2)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card space-y-4 p-4" aria-labelledby="claude">
        <div className="space-y-1">
          <h2 id="claude" className="font-semibold">
            Consumo de Claude
          </h2>
          <p className="text-sm text-muted">
            Cada mensaje en texto libre usa una llamada; los comandos (balance, deshacer, ayuda) no. El costo lo ves en la
            consola de Anthropic: los precios cambian.
          </p>
        </div>
        {/* Las llamadas ya están arriba. Dos columnas desde 352 px: un total de cientos de millones de
            tokens no cabe en una más angosta (e2e/diseno-tactil.spec.ts). */}
        <dl className="grid grid-cols-1 gap-3 min-[22rem]:grid-cols-2">
          <Stat label="Tokens de entrada" value={formatCount(activity.claude.inputTokens)} />
          <Stat label="Tokens de salida" value={formatCount(activity.claude.outputTokens)} />
        </dl>

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
