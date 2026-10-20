import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { todayInTimezone } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import { listAccountEvents } from "@/modules/admin/history/events-log";
import {
  ADMIN_LOG_MAX,
  ADMIN_LOG_TIMEZONE,
  EVENT_TYPE_FILTER_TEXTS,
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
import { adminModuleLabel, adminTitle } from "@/modules/admin/modules";
import { PageSkeleton } from "../../page-skeleton";
import { ActiveFilters } from "../active-filters";
import { EventItem } from "./event-item";
import { FilterBar } from "./filter-bar";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: adminTitle(adminModuleLabel("historial", locale), locale) };
}

const TEXTS = texts(
  {
    title: "Registro y vinculación de WhatsApp",
    intro: "Todas las cuentas · hora de Colombia",
    noneFiltered: "No hay eventos con estos filtros.",
    none: "Todavía no hay eventos.",
    count: (n: number) => `${n} ${n === 1 ? "evento" : "eventos"}`,
    older: "Ver más antiguos",
    max: (n: number) => `Se muestran los ${n} más recientes: usa los filtros para encontrar los demás.`,
  },
  {
    en: {
      title: "Sign-ups and WhatsApp linking",
      intro: "Every account · Colombia time",
      noneFiltered: "There are no events with these filters.",
      none: "There are no events yet.",
      count: (n) => `${n} ${n === 1 ? "event" : "events"}`,
      older: "See older ones",
      max: (n) => `The ${n} most recent are shown: use the filters to find the rest.`,
    },
  },
);

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
  const locale = await getLocale();
  const t = TEXTS[locale];
  const filters = parseLogFilters(params);
  const today = todayInTimezone(ADMIN_LOG_TIMEZONE);
  const log = await listAccountEvents(filters, today);
  const groups = groupByDay(log.entries, today, locale);
  const panelOpen = params.panel === "1";

  return (
    <section className="card space-y-4 p-4" aria-labelledby="historial">
        <div className="space-y-1">
          <h2 id="historial" className="font-semibold">
            {t.title}
          </h2>
          <p className="text-sm text-muted">{t.intro}</p>
        </div>

        {/* key: con otros filtros (o al quitarlos) el formulario empieza de nuevo con lo de la URL. */}
        <FilterBar key={`${logHref(filters)}|${panelOpen}`} filters={filters} panelOpen={panelOpen} />
        <HistoryActiveFilters filters={filters} locale={locale} />

        <p className="text-sm text-muted" aria-live="polite">
          {log.total === 0 ? (activeFilterCount(filters) > 0 ? t.noneFiltered : t.none) : t.count(log.total)}
        </p>

        {groups.map((group) => (
          <section key={group.day} aria-labelledby={`dia-${group.day}`}>
            <h3 id={`dia-${group.day}`} className="text-xs font-medium text-muted">
              {group.label}
            </h3>
            <ol className="divide-y divide-border">
              {group.entries.map((entry) => (
                <EventItem key={entry.id} entry={entry} filters={filters} locale={locale} />
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
              {t.older}
            </Link>
          ) : (
            <p className="text-center text-sm text-muted">{t.max(ADMIN_LOG_MAX)}</p>
          ))}
    </section>
  );
}

/** Los filtros activos del Historial: cada tipo, la fecha y la búsqueda. */
function HistoryActiveFilters({ filters, locale }: { filters: LogFilters; locale: Locale }) {
  const items = [
    ...filters.types.map((type) => ({
      label: EVENT_TYPE_FILTER_TEXTS[locale][type],
      href: logHref(withoutFilter(filters, { type })),
    })),
    ...(filters.date !== "todo" ? [{ label: dateFilterLabel(filters, locale), href: logHref(withoutFilter(filters, "date")) }] : []),
    ...(filters.search ? [{ label: `“${filters.search}”`, href: logHref(withoutFilter(filters, "search")) }] : []),
  ];
  return <ActiveFilters items={items} clearHref={logHref(NO_FILTERS)} locale={locale} />;
}
