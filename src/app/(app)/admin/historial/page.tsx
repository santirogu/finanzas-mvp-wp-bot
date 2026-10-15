import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { todayInTimezone } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import { listAccountEvents, type LogEntry } from "@/modules/admin/history/events-log";
import {
  ADMIN_LOG_MAX,
  ADMIN_LOG_TIMEZONE,
  EVENT_TYPE_FILTER_LABELS,
  activeFilterCount,
  dateFilterLabel,
  eventDetail,
  formatEventHour,
  formatEventTime,
  formatPhone,
  groupByDay,
  logHref,
  NO_FILTERS,
  parseLogFilters,
  showMore,
  withoutFilter,
  type LogFilters,
} from "@/modules/admin/history/log-filters";
import { PageSkeleton } from "../../page-skeleton";
import { FilterBar } from "./filter-bar";

export const metadata: Metadata = { title: "Historial · Administración" };

// Los filtros vienen en la URL: se leen en cada request, dentro de Suspense (Cache Components).
export default function HistoryPage({ searchParams }: PageProps<"/admin/historial">) {
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
        <ActiveFilters filters={filters} />

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

/** Los filtros activos como etiquetas: la ✕ de cada una lo quita. */
function ActiveFilters({ filters }: { filters: LogFilters }) {
  const items: { label: string; href: string }[] = [
    ...filters.types.map((type) => ({
      label: EVENT_TYPE_FILTER_LABELS[type],
      href: logHref(withoutFilter(filters, { type })),
    })),
    ...(filters.date !== "todo" ? [{ label: dateFilterLabel(filters), href: logHref(withoutFilter(filters, "date")) }] : []),
    ...(filters.search ? [{ label: `“${filters.search}”`, href: logHref(withoutFilter(filters, "search")) }] : []),
  ];
  if (items.length === 0) return null;
  return (
    <ul aria-label="Filtros activos" className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <li key={item.href + item.label}>
          <Link
            href={item.href}
            scroll={false}
            aria-label={`Quitar filtro: ${item.label}`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-sm hover:bg-brand/20"
          >
            <span className="truncate">{item.label}</span>
            <span aria-hidden>✕</span>
          </Link>
        </li>
      ))}
      <li>
        <Link href={logHref(NO_FILTERS)} scroll={false} className="px-1 text-sm font-medium text-muted hover:text-foreground">
          Quitar todo
        </Link>
      </li>
    </ul>
  );
}

// Ícono y color de cada tipo de evento (el texto ya dice qué pasó: el ícono es decorativo).
const ICON_PATHS: Record<LogEntry["type"], ReactNode> = {
  registered: (
    <>
      <circle cx="8" cy="7" r="3" />
      <path d="M2.5 16.5c.6-2.9 2.9-4.5 5.5-4.5s4.9 1.6 5.5 4.5M15.5 6v5M13 8.5h5" />
    </>
  ),
  whatsapp_code_created: (
    <>
      <circle cx="7" cy="10" r="3" />
      <path d="M10 10h7M14.5 10v2.5M16.5 10v2" />
    </>
  ),
  whatsapp_linked: <path d="M8 12l4-4M7 9.5 5.5 11a2.5 2.5 0 0 0 3.5 3.5L10.5 13M13 10.5 14.5 9A2.5 2.5 0 0 0 11 5.5L9.5 7" />,
  whatsapp_unlinked: <path d="M7 9.5 5.5 11a2.5 2.5 0 0 0 3.5 3.5L10.5 13M13 10.5 14.5 9A2.5 2.5 0 0 0 11 5.5L9.5 7M4 4l12 12" />,
  whatsapp_link_failed: <path d="M10 3.5 2.5 16.5h15L10 3.5zM10 8.5v3.5M10 14.25v.01" />,
};

const ICON_COLORS: Record<LogEntry["type"], string> = {
  registered: "bg-brand/10 text-brand",
  whatsapp_code_created: "bg-border text-muted",
  whatsapp_linked: "bg-income/10 text-income",
  whatsapp_unlinked: "bg-expense/10 text-expense",
  whatsapp_link_failed: "bg-danger/10 text-danger",
};

function EventItem({ entry, filters }: { entry: LogEntry; filters: LogFilters }) {
  // Tocar el nombre muestra solo los eventos de esa cuenta.
  const who = entry.account ? (
    <Link
      href={logHref({ ...filters, search: entry.account.email, limit: NO_FILTERS.limit })}
      scroll={false}
      className="font-medium text-brand hover:underline"
    >
      {entry.account.name}
    </Link>
  ) : (
    "Una cuenta"
  );
  const phone = entry.phone ? <span className="whitespace-nowrap font-mono text-[0.8125rem]">{formatPhone(entry.phone)}</span> : null;
  const detail = eventDetail(entry.details);

  return (
    <li className="flex gap-3 py-3">
      <span className={`flex size-8 flex-none items-center justify-center rounded-full ${ICON_COLORS[entry.type]}`} aria-hidden>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          {ICON_PATHS[entry.type]}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{sentence(entry, who, phone)}</p>
        <p className="mt-0.5 break-words text-xs text-muted">
          {[entry.account?.email ?? "Sin cuenta", detail].filter(Boolean).join(" · ")}
          {" · "}
          <time dateTime={entry.createdAt.toISOString()} title={formatEventTime(entry.createdAt)}>
            {formatEventHour(entry.createdAt)}
          </time>
        </p>
      </div>
    </li>
  );
}

/** Qué pasó, como frase: "Beto vinculó su WhatsApp +57 300 111 2233". */
function sentence(entry: LogEntry, who: ReactNode, phone: ReactNode): ReactNode {
  switch (entry.type) {
    case "registered":
      return <>{who} se registró</>;
    case "whatsapp_code_created":
      return <>{who} pidió un código para vincular su WhatsApp</>;
    case "whatsapp_linked":
      return <>{who} vinculó su WhatsApp {phone}</>;
    case "whatsapp_unlinked":
      return entry.details.reason === "by_user" ? (
        <>{who} desvinculó su WhatsApp {phone}</>
      ) : (
        <>Se desvinculó el WhatsApp {phone} de {who}</>
      );
    case "whatsapp_link_failed":
      return <>Intento fallido de vinculación desde {phone}</>;
  }
}
