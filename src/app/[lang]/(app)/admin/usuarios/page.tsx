import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { todayInTimezone } from "@/lib/dates";
import { requireAdmin } from "@/lib/session";
import { ADMIN_MAX_ROWS, ADMIN_TIMEZONE, formatDate, formatPhone } from "@/modules/admin/shared/filters";
import {
  NO_USER_FILTERS,
  activeUserFilters,
  parseUserFilters,
  showMoreUsers,
  userDetailHref,
  usersHref,
  withoutUserFilter,
  type UserFilters,
} from "@/modules/admin/users/user-filters";
import { adminModuleLabel, adminTitle } from "@/modules/admin/modules";
import { listUsers, type UserRow } from "@/modules/admin/users/users";
import { PageSkeleton } from "../../page-skeleton";
import { ActiveFilters } from "../active-filters";
import { AccountBadges, Initial } from "./account-badges";
import { UsersFilterBar } from "./filter-bar";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: adminTitle(adminModuleLabel("usuarios", locale), locale) };
}

const TEXTS = texts(
  {
    title: "Cuentas",
    intro: "De la más nueva a la más vieja · hora de Colombia",
    noneFiltered: "No hay cuentas con estos filtros.",
    none: "Todavía no hay cuentas.",
    count: (n: number) => `${n} ${n === 1 ? "cuenta" : "cuentas"}`,
    more: "Ver más cuentas",
    max: (n: number) => `Se muestran las ${n} más nuevas: usa los filtros para encontrar las demás.`,
    noWhatsApp: "Sin WhatsApp",
    registered: "Registro",
  },
  {
    en: {
      title: "Accounts",
      intro: "From newest to oldest · Colombia time",
      noneFiltered: "There are no accounts with these filters.",
      none: "There are no accounts yet.",
      count: (n) => `${n} ${n === 1 ? "account" : "accounts"}`,
      more: "See more accounts",
      max: (n) => `The ${n} newest are shown: use the filters to find the rest.`,
      noWhatsApp: "No WhatsApp",
      registered: "Signed up",
    },
  },
);

// Los filtros vienen en la URL: se leen en cada request, dentro de Suspense (Cache Components).
export default function UsersPage({ searchParams }: PageProps<"/[lang]/admin/usuarios">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <Users params={params} />
      ))}
    </Suspense>
  );
}

async function Users({ params }: { params: Record<string, string | string[] | undefined> }) {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();
  const locale = await getLocale();
  const t = TEXTS[locale];
  const filters = parseUserFilters(params);
  const page = await listUsers(filters, todayInTimezone(ADMIN_TIMEZONE));
  const panelOpen = params.panel === "1";
  const filtered = activeUserFilters(filters).length > 0;

  return (
    <section className="card space-y-4 p-4" aria-labelledby="usuarios">
      <div className="space-y-1">
        <h2 id="usuarios" className="font-semibold">
          {t.title}
        </h2>
        <p className="text-sm text-muted">{t.intro}</p>
      </div>

      {/* key: con otros filtros (o al quitarlos) el formulario empieza de nuevo con lo de la URL. */}
      <UsersFilterBar key={`${usersHref(filters)}|${panelOpen}`} filters={filters} panelOpen={panelOpen} />
      <UsersActiveFilters filters={filters} locale={locale} />

      <p className="text-sm text-muted" aria-live="polite">
        {page.total === 0 ? (filtered ? t.noneFiltered : t.none) : t.count(page.total)}
      </p>

      {page.users.length > 0 && (
        <ul aria-label={t.title} className="divide-y divide-border">
          {page.users.map((account) => (
            <UserItem key={account.id} account={account} locale={locale} />
          ))}
        </ul>
      )}

      {page.hasMore &&
        (filters.limit < ADMIN_MAX_ROWS ? (
          <Link
            href={usersHref(showMoreUsers(filters))}
            scroll={false}
            className="block rounded-lg border border-border py-2 text-center text-sm font-medium hover:bg-background"
          >
            {t.more}
          </Link>
        ) : (
          <p className="text-center text-sm text-muted">{t.max(ADMIN_MAX_ROWS)}</p>
        ))}
    </section>
  );
}

function UserItem({ account, locale }: { account: UserRow; locale: Locale }) {
  const t = TEXTS[locale];
  return (
    <li>
      <Link href={userDetailHref(account.id)} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-background">
        <Initial name={account.name} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            <span className="min-w-0 break-words">{account.name}</span>
            <AccountBadges
              role={account.role}
              superAdmin={account.superAdmin}
              lockedUntil={account.lockedUntil}
              suspended={account.suspendedAt !== null}
              locale={locale}
            />
          </p>
          <p className="break-all text-sm text-muted">{account.email}</p>
          <p className="text-xs text-muted">
            {account.phone ? `WhatsApp ${formatPhone(account.phone)}` : t.noWhatsApp} · {t.registered}: {formatDate(account.createdAt, locale)}
          </p>
        </div>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4 flex-none text-muted" aria-hidden>
          <path d="m8 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </li>
  );
}

/** Los filtros activos de Usuarios como etiquetas: la ✕ de cada una lo quita. */
function UsersActiveFilters({ filters, locale }: { filters: UserFilters; locale: Locale }) {
  const items = activeUserFilters(filters, locale).map(({ key, label }) => ({
    label,
    href: usersHref(withoutUserFilter(filters, key)),
  }));
  return <ActiveFilters items={items} clearHref={usersHref(NO_USER_FILTERS)} locale={locale} />;
}
