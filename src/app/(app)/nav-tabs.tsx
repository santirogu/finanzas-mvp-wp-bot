"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { parseMonthParam } from "@/lib/dates";

const TABS = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/ingresos", label: "Ingresos" },
  { href: "/egresos", label: "Egresos" },
] as const;

// Solo para admins: el servidor decide si se muestra (src/app/(app)/layout.tsx). Se marca en
// cualquier página de la sección (/admin/...).
const ADMIN_TAB = { href: "/admin", label: "Admin" } as const;

/**
 * Pestañas que marcan la ruta actual y siguen en el mes que se está viendo (`?mes=`): de septiembre
 * en el Resumen se pasa a los egresos de septiembre. Lee la URL: va dentro de Suspense en el layout.
 */
export function NavTabs({ showAdmin = false }: { showAdmin?: boolean }) {
  return <TabLinks pathname={usePathname()} month={useSearchParams().get("mes")} showAdmin={showAdmin} />;
}

const isActive = (href: string, pathname: string | null) =>
  href === ADMIN_TAB.href ? pathname === href || Boolean(pathname?.startsWith(`${href}/`)) : pathname === href;

/**
 * Las pestañas en sí. Sin `pathname` no marca ninguna: es el respaldo del layout mientras se
 * resuelve la URL de una ruta dinámica (p. ej. /movimientos/[id]/editar).
 */
export function TabLinks({
  pathname,
  month = null,
  showAdmin = false,
}: {
  pathname: string | null;
  /** El `?mes=` de la URL; las pestañas de Admin no lo llevan. */
  month?: string | null;
  showAdmin?: boolean;
}) {
  const tabs = showAdmin ? [...TABS, ADMIN_TAB] : TABS;
  // Solo un mes bien escrito: el servidor decide si se puede ver (no futuro).
  const query = parseMonthParam(month) ? `?mes=${month}` : "";
  return (
    <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = isActive(tab.href, pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href === ADMIN_TAB.href ? tab.href : tab.href + query}
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
