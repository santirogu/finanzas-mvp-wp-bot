"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/ingresos", label: "Ingresos" },
  { href: "/egresos", label: "Egresos" },
] as const;

// Solo para admins: el servidor decide si se muestra (src/app/(app)/layout.tsx). Se marca en
// cualquier página de la sección (/admin/...).
const ADMIN_TAB = { href: "/admin", label: "Admin" } as const;

/** Pestañas que marcan la ruta actual (lee la URL: va dentro de Suspense en el layout). */
export function NavTabs({ showAdmin = false }: { showAdmin?: boolean }) {
  return <TabLinks pathname={usePathname()} showAdmin={showAdmin} />;
}

const isActive = (href: string, pathname: string | null) =>
  href === ADMIN_TAB.href ? pathname === href || Boolean(pathname?.startsWith(`${href}/`)) : pathname === href;

/**
 * Las pestañas en sí. Sin `pathname` no marca ninguna: es el respaldo del layout mientras se
 * resuelve la URL de una ruta dinámica (p. ej. /movimientos/[id]/editar).
 */
export function TabLinks({ pathname, showAdmin = false }: { pathname: string | null; showAdmin?: boolean }) {
  const tabs = showAdmin ? [...TABS, ADMIN_TAB] : TABS;
  return (
    <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = isActive(tab.href, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "border-brand text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
