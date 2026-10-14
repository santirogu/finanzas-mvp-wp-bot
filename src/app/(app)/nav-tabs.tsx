"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/ingresos", label: "Ingresos" },
  { href: "/egresos", label: "Egresos" },
] as const;

/** Pestañas que marcan la ruta actual (lee la URL: va dentro de Suspense en el layout). */
export function NavTabs() {
  return <TabLinks pathname={usePathname()} />;
}

/**
 * Las pestañas en sí. Sin `pathname` no marca ninguna: es el respaldo del layout mientras se
 * resuelve la URL de una ruta dinámica (p. ej. /movimientos/[id]/editar).
 */
export function TabLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="-mb-px mt-3 flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
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
