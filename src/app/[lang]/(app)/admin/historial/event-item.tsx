import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import type { LogEntry } from "@/modules/admin/history/events-log";
import {
  NO_FILTERS,
  eventDetail,
  formatEventHour,
  formatEventTime,
  formatPhone,
  isAdminAction,
  logHref,
  type LogFilters,
} from "@/modules/admin/history/log-filters";

// Un evento del historial: ícono, frase ("Beto vinculó su WhatsApp +57 300…") y detalle, en el idioma de
// la página. Lo usan el Historial y el detalle de cada cuenta en Usuarios.

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
  // Un candado cerrado: cambió su contraseña.
  password_changed: <path d="M5.5 9.5h9v7h-9zM7.5 9.5V7a2.5 2.5 0 0 1 5 0v2.5M10 12.25v1.5" />,
  login_unlocked: <path d="M5.5 9.5h9v7h-9zM7.5 9.5V7a2.5 2.5 0 0 1 4.9-.7M10 12.5v1.5" />,
  sessions_revoked: <path d="M8 4H5v12h3M12.5 13.5 16 10l-3.5-3.5M16 10H8.5" />,
  account_deleted: <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 10h6.6L14 6M8.5 9v4.5M11.5 9v4.5" />,
  account_suspended: <path d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM8.25 7.5v5M11.75 7.5v5" />,
  account_reactivated: <path d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM8.5 7.25v5.5L13 10z" />,
  // Un escudo con + (se dio el rol de admin) o con − (se quitó).
  admin_granted: <path d="M10 2.75 16 5v4.25c0 3.6-2.5 6.6-6 7.75-3.5-1.15-6-4.15-6-7.75V5zM10 7.5v4.5M7.75 9.75h4.5" />,
  admin_revoked: <path d="M10 2.75 16 5v4.25c0 3.6-2.5 6.6-6 7.75-3.5-1.15-6-4.15-6-7.75V5zM7.75 9.75h4.5" />,
  bot_claude_paused: <path d="M4 5.5h12v8H9l-3.5 2.5v-2.5H4zM8.75 8v3M11.25 8v3" />,
  bot_claude_resumed: <path d="M4 5.5h12v8H9l-3.5 2.5v-2.5H4zM8.75 7.75v3.5L12 9.5z" />,
  bot_limits_changed: <path d="M4 6h12M4 10h12M4 14h12M7 4.5v3M13 8.5v3M9.5 12.5v3" />,
  bot_monthly_limit_changed: <path d="M4.5 5.5h11v10h-11zM4.5 8.5h11M7.5 4v3M12.5 4v3M7.5 12h5" />,
  bot_replies_resent: <path d="M15.5 9A5.5 5.5 0 1 0 14 13M15.5 5v4h-4" />,
};

const ADMIN_COLOR = "bg-admin-surface text-admin";

const ICON_COLORS: Record<LogEntry["type"], string> = {
  registered: "bg-brand/10 text-brand",
  whatsapp_code_created: "bg-border text-muted",
  whatsapp_linked: "bg-income/10 text-income",
  whatsapp_unlinked: "bg-expense/10 text-expense",
  whatsapp_link_failed: "bg-danger/10 text-danger",
  password_changed: "bg-brand/10 text-brand",
  // Lo que hizo el admin va en su color (como la etiqueta Admin).
  login_unlocked: ADMIN_COLOR,
  sessions_revoked: ADMIN_COLOR,
  account_deleted: ADMIN_COLOR,
  account_suspended: ADMIN_COLOR,
  account_reactivated: ADMIN_COLOR,
  admin_granted: ADMIN_COLOR,
  admin_revoked: ADMIN_COLOR,
  bot_claude_paused: ADMIN_COLOR,
  bot_claude_resumed: ADMIN_COLOR,
  bot_limits_changed: ADMIN_COLOR,
  bot_monthly_limit_changed: ADMIN_COLOR,
  bot_replies_resent: ADMIN_COLOR,
};

/** Los cambios de la configuración del bot (/admin/bot): no son de ninguna cuenta. */
const BOT_EVENTS: readonly LogEntry["type"][] = [
  "bot_claude_paused",
  "bot_claude_resumed",
  "bot_limits_changed",
  "bot_monthly_limit_changed",
  "bot_replies_resent",
];

/**
 * Con `filters`, tocar el nombre muestra solo los eventos de esa cuenta (en el Historial); sin
 * ellos, el nombre va sin enlace. `inAccount`: en el detalle de una cuenta, con la fecha completa
 * (ahí no se agrupan por día) y sin repetir el correo.
 */
export function EventItem({
  entry,
  filters,
  inAccount = false,
  locale,
}: {
  entry: LogEntry;
  filters?: LogFilters;
  inAccount?: boolean;
  locale: Locale;
}) {
  const es = locale === "es";
  const name = entry.account && filters ? (
    <Link
      href={logHref({ ...filters, search: entry.account.email, limit: NO_FILTERS.limit })}
      scroll={false}
      className="font-medium text-brand hover:underline"
    >
      {entry.account.name}
    </Link>
  ) : (
    entry.account?.name
  );
  // Sin la cuenta (ya no existe), "Una cuenta"; en inglés cambia según dónde va en la frase.
  const who: Who = name
    ? { subject: name, object: name, whose: <>{name}&apos;s</>, account: <>{name}&apos;s account</> }
    : es
      ? { subject: "Una cuenta", object: "Una cuenta", whose: "Una cuenta", account: "Una cuenta" }
      : { subject: "An account", object: "an account", whose: "an account's", account: "an account" };
  const phone = entry.phone ? <span className="whitespace-nowrap">{formatPhone(entry.phone)}</span> : null;
  const detail = eventDetail(entry.details, locale);
  const color = isAdminAction(entry) ? ADMIN_COLOR : ICON_COLORS[entry.type];
  // De una cuenta que eliminó el admin no queda ningún dato; la configuración del bot no es de una cuenta.
  const where = BOT_EVENTS.includes(entry.type)
    ? es
      ? "Bot de WhatsApp"
      : "WhatsApp bot"
    : entry.type === "account_deleted"
      ? es
        ? "Sin datos de la cuenta"
        : "No account data"
      : (entry.account?.email ?? (es ? "Sin cuenta" : "No account"));
  const sentence = es ? spanishSentence : englishSentence;

  return (
    <li className="flex gap-3 py-3">
      <span className={`flex size-8 flex-none items-center justify-center rounded-full ${color}`} aria-hidden>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          {ICON_PATHS[entry.type]}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{sentence(entry, who, phone, entry.admin?.name)}</p>
        <p className="mt-0.5 break-words text-xs text-muted">
          {/* "correo · detalle · " antes de la hora (lo que no haya, se omite). */}
          {[...[inAccount ? "" : where, detail].filter(Boolean), ""].join(" · ")}
          <time dateTime={entry.createdAt.toISOString()} title={formatEventTime(entry.createdAt, locale)}>
            {inAccount ? formatEventTime(entry.createdAt, locale) : formatEventHour(entry.createdAt, locale)}
          </time>
        </p>
      </div>
    </li>
  );
}

/**
 * La cuenta en la frase: como sujeto ("Beto se registró"), como objeto, como dueña ("Beto's sign-in") y la
 * cuenta misma ("Beto's account"; sin la cuenta, "an account", no "an account's account").
 */
type Who = { subject: ReactNode; object: ReactNode; whose: ReactNode; account: ReactNode };

/** Qué pasó, como frase: "Beto vinculó su WhatsApp +57 300 111 2233". */
function spanishSentence(entry: LogEntry, { subject: who }: Who, phone: ReactNode, adminName: string | undefined): ReactNode {
  // Si la cuenta del admin ya no existe, no se sabe su nombre.
  const admin = adminName ?? "Un admin";
  switch (entry.type) {
    case "registered":
      return <>{who} se registró</>;
    case "whatsapp_code_created":
      return <>{who} pidió un código para vincular su WhatsApp</>;
    case "whatsapp_linked":
      return <>{who} vinculó su WhatsApp {phone}</>;
    case "whatsapp_unlinked":
      if (entry.details.reason === "by_user") return <>{who} desvinculó su WhatsApp {phone}</>;
      if (entry.details.reason === "by_admin") return <>{admin} desvinculó el WhatsApp {phone} de {who}</>;
      return <>Se desvinculó el WhatsApp {phone} de {who}</>;
    case "whatsapp_link_failed":
      return <>Intento fallido de vinculación desde {phone}</>;
    case "password_changed":
      return <>{who} cambió su contraseña</>;
    case "login_unlocked":
      return <>{admin} desbloqueó el inicio de sesión de {who}</>;
    case "sessions_revoked":
      return <>{admin} cerró las sesiones de {who}</>;
    case "account_suspended":
      return <>{admin} suspendió la cuenta de {who}</>;
    case "account_reactivated":
      return <>{admin} reactivó la cuenta de {who}</>;
    case "account_deleted":
      return <>{admin} eliminó una cuenta</>;
    case "admin_granted":
      return <>{admin} le dio el rol de admin a {who}</>;
    case "admin_revoked":
      return <>{admin} le quitó el rol de admin a {who}</>;
    case "bot_claude_paused":
      return <>{admin} pausó Claude en el bot</>;
    case "bot_claude_resumed":
      return <>{admin} reanudó Claude en el bot</>;
    case "bot_limits_changed":
      return <>{admin} cambió los topes de Claude por cuenta</>;
    case "bot_monthly_limit_changed":
      return <>{admin} cambió el tope mensual de tokens de Claude</>;
    case "bot_replies_resent":
      return <>{admin} reenvió las respuestas del bot que no habían salido</>;
  }
}

/** Lo mismo en inglés: "Beto linked their WhatsApp +57 300 111 2233". */
function englishSentence(entry: LogEntry, { subject, object, whose, account }: Who, phone: ReactNode, adminName: string | undefined): ReactNode {
  const admin = adminName ?? "An admin";
  switch (entry.type) {
    case "registered":
      return <>{subject} signed up</>;
    case "whatsapp_code_created":
      return <>{subject} requested a code to link their WhatsApp</>;
    case "whatsapp_linked":
      return <>{subject} linked their WhatsApp {phone}</>;
    case "whatsapp_unlinked":
      if (entry.details.reason === "by_user") return <>{subject} unlinked their WhatsApp {phone}</>;
      if (entry.details.reason === "by_admin") return <>{admin} unlinked the WhatsApp {phone} from {object}</>;
      return <>The WhatsApp {phone} was unlinked from {object}</>;
    case "whatsapp_link_failed":
      return <>Failed linking attempt from {phone}</>;
    case "password_changed":
      return <>{subject} changed their password</>;
    case "login_unlocked":
      return <>{admin} unlocked {whose} sign-in</>;
    case "sessions_revoked":
      return <>{admin} signed {object} out of their sessions</>;
    case "account_suspended":
      return <>{admin} suspended {account}</>;
    case "account_reactivated":
      return <>{admin} reactivated {account}</>;
    case "account_deleted":
      return <>{admin} deleted an account</>;
    case "admin_granted":
      return <>{admin} made {object} an admin</>;
    case "admin_revoked":
      return <>{admin} removed {whose} admin role</>;
    case "bot_claude_paused":
      return <>{admin} paused Claude in the bot</>;
    case "bot_claude_resumed":
      return <>{admin} resumed Claude in the bot</>;
    case "bot_limits_changed":
      return <>{admin} changed Claude&apos;s per-account limits</>;
    case "bot_monthly_limit_changed":
      return <>{admin} changed Claude&apos;s monthly token limit</>;
    case "bot_replies_resent":
      return <>{admin} resent the bot replies that hadn&apos;t gone out</>;
  }
}
