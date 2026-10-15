import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/session";
import { listAccountEvents } from "@/modules/admin/events-log";
import {
  EVENT_LABELS,
  EVENT_TYPES,
  eventDetail,
  formatEventTime,
  formatPhone,
  hasFilters,
  logHref,
  parseLogFilters,
  type LogFilters,
} from "@/modules/admin/log-filters";
import { PageSkeleton } from "../page-skeleton";

export const metadata: Metadata = { title: "Administración" };

// Los filtros vienen en la URL (formulario GET, sirve sin JavaScript): se leen en cada request,
// dentro de Suspense (Cache Components).
export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <Admin params={params} />
      ))}
    </Suspense>
  );
}

async function Admin({ params }: { params: Record<string, string | string[] | undefined> }) {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();
  const filters = parseLogFilters(params);
  const log = await listAccountEvents(filters);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Solo para administradores</p>
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
      </div>

      <section className="card space-y-4 p-4" aria-labelledby="historial">
        <div className="space-y-1">
          <h2 id="historial" className="font-semibold">
            Registro y vinculación de WhatsApp
          </h2>
          <p className="text-sm text-muted">
            Todas las cuentas, de lo más reciente a lo más antiguo. Horas de Colombia.
          </p>
        </div>
        <Filters filters={filters} />
        <p className="text-sm text-muted" aria-live="polite">
          {log.total === 0
            ? hasFilters(filters)
              ? "No hay eventos con estos filtros."
              : "Todavía no hay eventos."
            : `${log.total} ${log.total === 1 ? "evento" : "eventos"} · página ${log.page} de ${log.pageCount}`}
        </p>
        {log.entries.length > 0 && <EventsTable entries={log.entries} />}
        <Pagination filters={filters} page={log.page} pageCount={log.pageCount} />
      </section>

      <section className="card space-y-1 p-4 text-sm">
        <h2 className="font-semibold">Verificación en dos pasos</h2>
        <p>
          ✓ Activa.{" "}
          <Link href="/admin/verificacion" className="font-medium text-brand">
            Ver detalles
          </Link>
        </p>
      </section>
    </div>
  );
}

function Filters({ filters }: { filters: LogFilters }) {
  return (
    <form method="get" action="/admin" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Evento</span>
        <select name="tipo" defaultValue={filters.type ?? ""} className="input">
          <option value="">Todos</option>
          {EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {EVENT_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5 lg:col-span-2">
        <span className="text-sm font-medium">Buscar</span>
        <input
          name="q"
          type="search"
          defaultValue={filters.search}
          placeholder="Nombre, correo o número"
          maxLength={100}
          className="input"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Desde</span>
        <input name="desde" type="date" defaultValue={filters.from ?? ""} className="input" />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Hasta</span>
        <input name="hasta" type="date" defaultValue={filters.to ?? ""} className="input" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
        <button type="submit" className="btn-primary">
          Filtrar
        </button>
        {hasFilters(filters) && (
          <Link href="/admin" className="text-sm font-medium text-muted hover:text-foreground">
            Quitar filtros
          </Link>
        )}
      </div>
    </form>
  );
}

function EventsTable({ entries }: { entries: Awaited<ReturnType<typeof listAccountEvents>>["entries"] }) {
  return (
    // En celular la tabla se desliza de lado dentro de la tarjeta (la página no). tabIndex: así se
    // puede recorrer también con el teclado.
    <div
      role="region"
      aria-label="Tabla de eventos (se desliza de lado)"
      tabIndex={0}
      className="-mx-4 overflow-x-auto px-4 focus-visible:outline-2 focus-visible:outline-brand"
    >
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">Eventos de registro y vinculación de WhatsApp</caption>
        <thead className="border-b border-border text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">Fecha</th>
            <th scope="col" className="py-2 pr-4 font-medium">Cuenta</th>
            <th scope="col" className="py-2 pr-4 font-medium">Evento</th>
            <th scope="col" className="py-2 font-medium">Número</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => {
            const detail = eventDetail(entry.details);
            return (
              <tr key={entry.id} className="align-top">
                <td className="whitespace-nowrap py-2 pr-4 tabular-nums">
                  <time dateTime={entry.createdAt.toISOString()}>{formatEventTime(entry.createdAt)}</time>
                </td>
                <td className="py-2 pr-4">
                  {entry.account ? (
                    <>
                      <span className="block">{entry.account.name}</span>
                      <span className="block break-all text-muted">{entry.account.email}</span>
                    </>
                  ) : (
                    <span className="text-muted">Sin cuenta</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <span className="block">{EVENT_LABELS[entry.type]}</span>
                  {detail && <span className="block text-muted">{detail}</span>}
                </td>
                <td className="whitespace-nowrap py-2 font-mono">{entry.phone ? formatPhone(entry.phone) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ filters, page, pageCount }: { filters: LogFilters; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Páginas del historial" className="flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link href={logHref(filters, page - 1)} className="font-medium text-brand">
          ← Más recientes
        </Link>
      ) : (
        <span />
      )}
      {page < pageCount && (
        <Link href={logHref(filters, page + 1)} className="font-medium text-brand">
          Más antiguos →
        </Link>
      )}
    </nav>
  );
}
