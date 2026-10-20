import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { hasRole, isSuperAdmin, roleLabel } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { NO_FILTERS, logHref } from "@/modules/admin/history/log-filters";
import { adminTitle } from "@/modules/admin/modules";
import { formatDate, formatDateTime, formatHour, formatPhone } from "@/modules/admin/shared/filters";
import { describeUserAgent, formatIp } from "@/modules/admin/users/session-info";
import { USERS_PATH } from "@/modules/admin/users/user-filters";
import { getUserDetail, type UserDetail } from "@/modules/admin/users/users";
import { PageSkeleton } from "../../../page-skeleton";
import { EventItem } from "../../historial/event-item";
import { AccountBadges, Initial } from "../account-badges";
import { AccountActions, RevokeAdminActions } from "./account-actions";

// Sin el nombre de la cuenta en el título: quedaría en el historial del navegador.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: adminTitle(locale === "es" ? "Cuenta" : "Account", locale) };
}

const TEXTS = texts(
  {
    back: "Todas las cuentas",
    adminActions: "Acciones del admin",
    noAdminActions: "Todavía no hay acciones del admin sobre esta cuenta.",
    role: "Rol",
    state: "Estado",
    suspendedSince: (date: string) => `Suspendida desde el ${date}`,
    reason: (reason: string) => `Motivo: ${reason}`,
    active: "Activa",
    registered: "Registro",
    lastSignIn: "Último inicio de sesión",
    noSessions: "Sin sesiones guardadas",
    linkedSince: (date: string) => ` · desde el ${date}`,
    notLinked: "Sin vincular",
    lock: "Bloqueo",
    lockedUntil: (hour: string) => `Inicio de sesión bloqueado por intentos fallidos hasta las ${hour}`,
    noLock: "Sin bloqueo",
    twoFactor: "Verificación en dos pasos",
    twoFactorOn: "Activa",
    twoFactorOff: "Sin configurar",
    sessions: "Sesiones abiertas",
    noOpenSessions: "No tiene sesiones abiertas.",
    someSessions: (count: number, shown: number) => `${count} sesiones · se muestran las ${shown} usadas más recientemente`,
    allSessions: (count: number) => `${count} ${count === 1 ? "sesión" : "sesiones"} · la más reciente primero`,
    sessionLine: (ip: string, opened: string, expires: string) => `IP ${ip} · Abierta el ${opened} · Vence el ${expires}`,
    events: "Últimos eventos",
    eventsIntro: "Registro y vinculación de WhatsApp · hora de Colombia",
    noEvents: "Sin eventos.",
    history: "Ver todo su historial",
  },
  {
    en: {
      back: "All accounts",
      adminActions: "Admin actions",
      noAdminActions: "There are no admin actions on this account yet.",
      role: "Role",
      state: "Status",
      suspendedSince: (date) => `Suspended since ${date}`,
      reason: (reason) => `Reason: ${reason}`,
      active: "Active",
      registered: "Signed up",
      lastSignIn: "Last sign-in",
      noSessions: "No saved sessions",
      linkedSince: (date) => ` · since ${date}`,
      notLinked: "Not linked",
      lock: "Lock",
      lockedUntil: (hour) => `Sign-in locked after failed attempts until ${hour}`,
      noLock: "Not locked",
      twoFactor: "Two-step verification",
      twoFactorOn: "On",
      twoFactorOff: "Not set up",
      sessions: "Open sessions",
      noOpenSessions: "It has no open sessions.",
      someSessions: (count, shown) => `${count} sessions · the ${shown} most recently used are shown`,
      allSessions: (count) => `${count} ${count === 1 ? "session" : "sessions"} · most recent first`,
      sessionLine: (ip, opened, expires) => `IP ${ip} · Opened ${opened} · Expires ${expires}`,
      events: "Latest events",
      eventsIntro: "Sign-ups and WhatsApp linking · Colombia time",
      noEvents: "No events.",
      history: "See their whole history",
    },
  },
);

type Texts = (typeof TEXTS)["es"];

// El id de la URL es un dato de cada request: se lee dentro de Suspense (Cache Components).
export default function UserDetailPage({ params }: PageProps<"/[lang]/admin/usuarios/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {params.then(({ id }) => (
        <Account id={id} />
      ))}
    </Suspense>
  );
}

async function Account({ id }: { id: string }) {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  const admin = await requireAdmin();
  const locale = await getLocale();
  const t = TEXTS[locale];
  // Un id inválido o una cuenta que no existe (o se eliminó): el mismo 404.
  const account = await getUserDetail(decodeURIComponent(id));
  if (!account) notFound();
  // Las acciones de siempre: ni en la cuenta propia ni en la de otro admin (el servidor también lo
  // valida en cada acción).
  const own = account.id === admin.id;
  const targetIsAdmin = hasRole(account.role, "admin");
  const canAct = !own && !targetIsAdmin;
  // Dar y quitar el rol de admin: solo el super admin. Darlo, a una cuenta activa (no suspendida);
  // quitarlo, a otro admin, nunca al super admin (que es él mismo).
  const superAdmin = isSuperAdmin(admin.role, admin.superAdmin);
  const canMakeAdmin = superAdmin && canAct && !account.suspendedAt;
  const canRevokeAdmin = superAdmin && !own && targetIsAdmin && !isSuperAdmin(account.role, account.superAdmin);

  return (
    <div className="space-y-4">
      <Link href={USERS_PATH} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground">
        <span aria-hidden>←</span> {t.back}
      </Link>
      <Summary account={account} t={t} locale={locale} />
      <Sessions account={account} t={t} locale={locale} />
      {canAct && (
        <>
          <AccountActions
            canMakeAdmin={canMakeAdmin}
            target={{
              id: account.id,
              name: account.name,
              email: account.email,
              lockedUntil: account.lockedUntil && formatHour(account.lockedUntil, locale),
              openSessions: account.sessionCount,
              phone: account.phone && formatPhone(account.phone),
              suspendedSince: account.suspendedAt && formatDateTime(account.suspendedAt, locale),
              suspensionReason: account.suspensionReason,
            }}
          />
          <AdminActions account={account} t={t} />
        </>
      )}
      {canRevokeAdmin && (
        <>
          <RevokeAdminActions target={{ id: account.id, name: account.name }} />
          <AdminActions account={account} t={t} />
        </>
      )}
      <Events account={account} t={t} />
    </div>
  );
}

function AdminActions({ account, t }: { account: UserDetail; t: Texts }) {
  return (
    <section className="card space-y-3 p-4" aria-labelledby="acciones-admin">
      <h2 id="acciones-admin" className="font-semibold">
        {t.adminActions}
      </h2>
      {account.adminActions.length === 0 ? (
        <p className="text-sm text-muted">{t.noAdminActions}</p>
      ) : (
        <ol aria-label={t.adminActions} className="divide-y divide-border">
          {account.adminActions.map((entry) => (
            <EventItem key={entry.id} entry={entry} inAccount />
          ))}
        </ol>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Summary({ account, t, locale }: { account: UserDetail; t: Texts; locale: Locale }) {
  return (
    <section className="card space-y-4 p-4" aria-labelledby="cuenta">
      <div className="flex items-start gap-3">
        <Initial name={account.name} size="size-10" />
        <div className="min-w-0 space-y-0.5">
          <h2 id="cuenta" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
            <span className="min-w-0 break-words">{account.name}</span>
            <AccountBadges
              role={account.role}
              superAdmin={account.superAdmin}
              lockedUntil={account.lockedUntil}
              suspended={account.suspendedAt !== null}
              locale={locale}
            />
          </h2>
          <p className="break-all text-sm text-muted">{account.email}</p>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Field label={t.role}>{roleLabel(account.role, account.superAdmin, locale)}</Field>
        <Field label={t.state}>
          {account.suspendedAt ? (
            <>
              {t.suspendedSince(formatDateTime(account.suspendedAt, locale))}
              {account.suspensionReason && <span className="block text-muted">{t.reason(account.suspensionReason)}</span>}
            </>
          ) : (
            t.active
          )}
        </Field>
        <Field label={t.registered}>{formatDateTime(account.createdAt, locale)}</Field>
        <Field label={t.lastSignIn}>{account.lastSignInAt ? formatDateTime(account.lastSignInAt, locale) : t.noSessions}</Field>
        <Field label="WhatsApp">
          {account.phone ? (
            <>
              {formatPhone(account.phone)}
              {account.linkedAt && <span className="text-muted">{t.linkedSince(formatDate(account.linkedAt, locale))}</span>}
            </>
          ) : (
            t.notLinked
          )}
        </Field>
        <Field label={t.lock}>{account.lockedUntil ? t.lockedUntil(formatHour(account.lockedUntil, locale)) : t.noLock}</Field>
        {hasRole(account.role, "admin") && <Field label={t.twoFactor}>{account.twoFactorEnabled ? t.twoFactorOn : t.twoFactorOff}</Field>}
      </dl>
    </section>
  );
}

function Sessions({ account, t, locale }: { account: UserDetail; t: Texts; locale: Locale }) {
  const { sessions, sessionCount } = account;
  return (
    <section className="card space-y-3 p-4" aria-labelledby="sesiones">
      <div className="space-y-1">
        <h2 id="sesiones" className="font-semibold">
          {t.sessions}
        </h2>
        <p className="text-sm text-muted">
          {sessionCount === 0 ? t.noOpenSessions : sessions.length < sessionCount ? t.someSessions(sessionCount, sessions.length) : t.allSessions(sessionCount)}
        </p>
      </div>
      {sessions.length > 0 && (
        <ul aria-label={t.sessions} className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="space-y-0.5 py-3 text-sm">
              <p className="font-medium" title={s.userAgent ?? undefined}>
                {describeUserAgent(s.userAgent, locale)}
              </p>
              <p className="text-muted">{t.sessionLine(formatIp(s.ipAddress, locale), formatDateTime(s.createdAt, locale), formatDate(s.expiresAt, locale))}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Events({ account, t }: { account: UserDetail; t: Texts }) {
  return (
    <section className="card space-y-3 p-4" aria-labelledby="eventos">
      <div className="space-y-1">
        <h2 id="eventos" className="font-semibold">
          {t.events}
        </h2>
        <p className="text-sm text-muted">{t.eventsIntro}</p>
      </div>
      {account.events.length === 0 ? (
        <p className="text-sm text-muted">{t.noEvents}</p>
      ) : (
        <ol aria-label={t.events} className="divide-y divide-border">
          {account.events.map((entry) => (
            <EventItem key={entry.id} entry={entry} inAccount />
          ))}
        </ol>
      )}
      <Link href={logHref({ ...NO_FILTERS, search: account.email })} className="inline-block text-sm font-medium text-brand hover:underline">
        {t.history}
      </Link>
    </section>
  );
}
