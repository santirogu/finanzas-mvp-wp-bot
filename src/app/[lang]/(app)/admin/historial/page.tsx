import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { todayInTimezone } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import { listAccountEvents } from "@/modules/admin/history/events-log";
import {
  ADMIN_LOG_MAX,
  ADMIN_LOG_TIMEZONE,
  EVENT_TYPE_FILTER_LABELS,
  activeFilterCount,
  dateFilterLabel,
  groupByDay,
  logHref,
  NO_FILTERS,
  parseLogFilters,
  showMore,
  withoutFilter,
  type LogFilters,
} from "@/modules/admin/history/log-filters";
import { PageSkeleton } from "../../page-skeleton";
import { ActiveFilters } from "../active-filters";
import { EventItem } from "./event-item";
import { FilterBar } from "./filter-bar";

export const metadata: Metadata = { title: "Historial · Administración" };

// Los filtros vienen en la URL: se leen en cada request, dentro de Suspense (Cache Components).
export default function HistoryPage({ searchParams }: PageProps<"/[lang]/admin/historial">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <History params={params} />
      ))}
    </Suspense>
  );
}

async function History({ params }: { params: Record<string, string | string[] | undefined> }) {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();
  const filters = parseLogFilters(params);
  const today = todayInTimezone(ADMIN_LOG_TIMEZONE);
  const log = await listAccountEvents(filters, today);
  const groups = groupByDay(log.entries, today);
  const panelOpen = params.panel === "1";

  return (
    <section className="card space-y-4 p-4" aria-labelledby="historial">
        <div className="space-y-1">
          <h2 id="historial" className="font-semibold">
            Registro y vinculación de WhatsApp
          </h2>
          <p className="text-sm text-muted">Todas las cuentas · hora de Colombia</p>
        </div>

        {/* key: con otros filtros (o al quitarlos) el formulario empieza de nuevo con lo de la URL. */}
        <FilterBar key={`${logHref(filters)}|${panelOpen}`} filters={filters} panelOpen={panelOpen} />
        <HistoryActiveFilters filters={filters} />

        <p className="text-sm text-muted" aria-live="polite">
          {log.total === 0
            ? activeFilterCount(filters) > 0
              ? "No hay eventos con estos filtros."
              : "Todavía no hay eventos."
            : `${log.total} ${log.total === 1 ? "evento" : "eventos"}`}
        </p>

        {groups.map((group) => (
          <section key={group.day} aria-labelledby={`dia-${group.day}`}>
            <h3 id={`dia-${group.day}`} className="text-xs font-medium text-muted">
              {group.label}
            </h3>
            <ol className="divide-y divide-border">
              {group.entries.map((entry) => (
                <EventItem key={entry.id} entry={entry} filters={filters} />
              ))}
            </ol>
          </section>
        ))}

        {log.hasMore &&
          (filters.limit < ADMIN_LOG_MAX ? (
            <Link
              href={logHref(showMore(filters))}
              scroll={false}
              className="block rounded-lg border border-border py-2 text-center text-sm font-medium hover:bg-background"
            >
              Ver más antiguos
            </Link>
          ) : (
            <p className="text-center text-sm text-muted">
              Se muestran los {ADMIN_LOG_MAX} más recientes: usa los filtros para encontrar los demás.
            </p>
          ))}
    </section>
  );
}

/** Los filtros activos del Historial: cada tipo, la fecha y la búsqueda. */
function HistoryActiveFilters({ filters }: { filters: LogFilters }) {
  const items = [
    ...filters.types.map((type) => ({
      label: EVENT_TYPE_FILTER_LABELS[type],
      href: logHref(withoutFilter(filters, { type })),
    })),
    ...(filters.date !== "todo" ? [{ label: dateFilterLabel(filters), href: logHref(withoutFilter(filters, "date")) }] : []),
    ...(filters.search ? [{ label: `“${filters.search}”`, href: logHref(withoutFilter(filters, "search")) }] : []),
  ];
  return <ActiveFilters items={items} clearHref={logHref(NO_FILTERS)} />;
}
