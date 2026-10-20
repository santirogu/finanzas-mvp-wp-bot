import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { hasRole, isSuperAdmin, roleLabel } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { NO_FILTERS, logHref } from "@/modules/admin/history/log-filters";
import { formatDate, formatDateTime, formatHour, formatPhone } from "@/modules/admin/shared/filters";
import { describeUserAgent, formatIp } from "@/modules/admin/users/session-info";
import { USERS_PATH } from "@/modules/admin/users/user-filters";
import { getUserDetail, type UserDetail } from "@/modules/admin/users/users";
import { PageSkeleton } from "../../../page-skeleton";
import { EventItem } from "../../historial/event-item";
import { AccountBadges, Initial } from "../account-badges";
import { AccountActions, RevokeAdminActions } from "./account-actions";

// Sin el nombre de la cuenta en el título: quedaría en el historial del navegador.
export const metadata: Metadata = { title: "Cuenta · Administración" };

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
        <span aria-hidden>←</span> Todas las cuentas
      </Link>
      <Summary account={account} />
      <Sessions account={account} />
      {canAct && (
        <>
          <AccountActions
            canMakeAdmin={canMakeAdmin}
            target={{
              id: account.id,
              name: account.name,
              email: account.email,
              lockedUntil: account.lockedUntil && formatHour(account.lockedUntil),
              openSessions: account.sessionCount,
              phone: account.phone && formatPhone(account.phone),
              suspendedSince: account.suspendedAt && formatDateTime(account.suspendedAt),
              suspensionReason: account.suspensionReason,
            }}
          />
          <AdminActions account={account} />
        </>
      )}
      {canRevokeAdmin && (
        <>
          <RevokeAdminActions target={{ id: account.id, name: account.name }} />
          <AdminActions account={account} />
        </>
      )}
      <Events account={account} />
    </div>
  );
}

function AdminActions({ account }: { account: UserDetail }) {
  return (
    <section className="card space-y-3 p-4" aria-labelledby="acciones-admin">
      <h2 id="acciones-admin" className="font-semibold">
        Acciones del admin
      </h2>
      {account.adminActions.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay acciones del admin sobre esta cuenta.</p>
      ) : (
        <ol aria-label="Acciones del admin" className="divide-y divide-border">
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

function Summary({ account }: { account: UserDetail }) {
  return (
    <section className="card space-y-4 p-4" aria-labelledby="cuenta">
      <div className="flex items-start gap-3">
        <Initial name={account.name} size="size-10" />
        <div className="min-w-0 space-y-0.5">
          <h2 id="cuenta" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
            <span className="min-w-0 break-words">{account.name}</span>
            <AccountBadges role={account.role} superAdmin={account.superAdmin} lockedUntil={account.lockedUntil} suspended={account.suspendedAt !== null} />
          </h2>
          <p className="break-all text-sm text-muted">{account.email}</p>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Field label="Rol">{roleLabel(account.role, account.superAdmin)}</Field>
        <Field label="Estado">
          {account.suspendedAt ? (
            <>
              Suspendida desde el {formatDateTime(account.suspendedAt)}
              {account.suspensionReason && <span className="block text-muted">Motivo: {account.suspensionReason}</span>}
            </>
          ) : (
            "Activa"
          )}
        </Field>
        <Field label="Registro">{formatDateTime(account.createdAt)}</Field>
        <Field label="Último inicio de sesión">
          {account.lastSignInAt ? formatDateTime(account.lastSignInAt) : "Sin sesiones guardadas"}
        </Field>
        <Field label="WhatsApp">
          {account.phone ? (
            <>
              {formatPhone(account.phone)}
              {account.linkedAt && <span className="text-muted"> · desde el {formatDate(account.linkedAt)}</span>}
            </>
          ) : (
            "Sin vincular"
          )}
        </Field>
        <Field label="Bloqueo">
          {account.lockedUntil
            ? `Inicio de sesión bloqueado por intentos fallidos hasta las ${formatHour(account.lockedUntil)}`
            : "Sin bloqueo"}
        </Field>
        {hasRole(account.role, "admin") && (
          <Field label="Verificación en dos pasos">{account.twoFactorEnabled ? "Activa" : "Sin configurar"}</Field>
        )}
      </dl>
    </section>
  );
}

function Sessions({ account }: { account: UserDetail }) {
  const { sessions, sessionCount } = account;
  return (
    <section className="card space-y-3 p-4" aria-labelledby="sesiones">
      <div className="space-y-1">
        <h2 id="sesiones" className="font-semibold">
          Sesiones abiertas
        </h2>
        <p className="text-sm text-muted">
          {sessionCount === 0
            ? "No tiene sesiones abiertas."
            : sessions.length < sessionCount
              ? `${sessionCount} sesiones · se muestran las ${sessions.length} usadas más recientemente`
              : `${sessionCount} ${sessionCount === 1 ? "sesión" : "sesiones"} · la más reciente primero`}
        </p>
      </div>
      {sessions.length > 0 && (
        <ul aria-label="Sesiones abiertas" className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="space-y-0.5 py-3 text-sm">
              <p className="font-medium" title={s.userAgent ?? undefined}>
                {describeUserAgent(s.userAgent)}
              </p>
              <p className="text-muted">
                IP {formatIp(s.ipAddress)} · Abierta el {formatDateTime(s.createdAt)} · Vence el {formatDate(s.expiresAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Events({ account }: { account: UserDetail }) {
  return (
    <section className="card space-y-3 p-4" aria-labelledby="eventos">
      <div className="space-y-1">
        <h2 id="eventos" className="font-semibold">
          Últimos eventos
        </h2>
        <p className="text-sm text-muted">Registro y vinculación de WhatsApp · hora de Colombia</p>
      </div>
      {account.events.length === 0 ? (
        <p className="text-sm text-muted">Sin eventos.</p>
      ) : (
        <ol aria-label="Últimos eventos" className="divide-y divide-border">
          {account.events.map((entry) => (
            <EventItem key={entry.id} entry={entry} inAccount />
          ))}
        </ol>
      )}
      <Link href={logHref({ ...NO_FILTERS, search: account.email })} className="inline-block text-sm font-medium text-brand hover:underline">
        Ver todo su historial
      </Link>
    </section>
  );
}
