import Link from "next/link";
import type { ReactNode } from "react";
import type { LogEntry } from "@/modules/admin/history/events-log";
import {
  NO_FILTERS,
  eventDetail,
  formatEventHour,
  formatEventTime,
  formatPhone,
  logHref,
  type LogFilters,
} from "@/modules/admin/history/log-filters";

// Un evento del historial: ícono, frase ("Beto vinculó su WhatsApp +57 300…") y detalle. Lo usan el
// Historial y el detalle de cada cuenta en Usuarios.

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

/**
 * Con `filters`, tocar el nombre muestra solo los eventos de esa cuenta (en el Historial); sin
 * ellos, el nombre va sin enlace. `inAccount`: en el detalle de una cuenta, con la fecha completa
 * (ahí no se agrupan por día) y sin repetir el correo.
 */
export function EventItem({ entry, filters, inAccount = false }: { entry: LogEntry; filters?: LogFilters; inAccount?: boolean }) {
  const who = entry.account && filters ? (
    <Link
      href={logHref({ ...filters, search: entry.account.email, limit: NO_FILTERS.limit })}
      scroll={false}
      className="font-medium text-brand hover:underline"
    >
      {entry.account.name}
    </Link>
  ) : (
    (entry.account?.name ?? "Una cuenta")
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
          {/* "correo · detalle · " antes de la hora (lo que no haya, se omite). */}
          {[...[inAccount ? "" : (entry.account?.email ?? "Sin cuenta"), detail].filter(Boolean), ""].join(" · ")}
          <time dateTime={entry.createdAt.toISOString()} title={formatEventTime(entry.createdAt)}>
            {inAccount ? formatEventTime(entry.createdAt) : formatEventHour(entry.createdAt)}
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
