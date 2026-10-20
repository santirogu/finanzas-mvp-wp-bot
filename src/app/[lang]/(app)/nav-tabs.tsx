"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTexts } from "@/i18n/client";
import { useAppPathname } from "@/i18n/navigation";
import { ShieldIcon } from "@/components/shield-icon";
import { useCurrentInView } from "@/components/use-current-in-view";
import { parseMonthParam } from "@/lib/dates";
import { TAB_TEXTS } from "./tab-texts";

const TABS = ["/dashboard", "/ingresos", "/egresos", "/gastos-fijos", "/reportes"] as const;



// Las que muestran un mes (y lo siguen al pasar de una a otra). Fijos mira los últimos meses y Reportes
// tiene su propio período.
const MONTH_TABS = new Set<string>(["/dashboard", "/ingresos", "/egresos"]);

// Solo para admins: el servidor decide si se muestra (src/app/[lang]/(app)/layout.tsx). Se marca en
// cualquier página de la sección (/admin/...).
const ADMIN_TAB = "/admin";

/**
 * Pestañas que marcan la ruta actual y siguen en el mes que se está viendo (`?mes=`): de septiembre
 * en el Resumen se pasa a los egresos de septiembre. Lee la URL: va dentro de Suspense en el layout.
 */
export function NavTabs({ showAdmin = false }: { showAdmin?: boolean }) {
  return <TabLinks pathname={useAppPathname()} month={useSearchParams().get("mes")} showAdmin={showAdmin} />;
}

const isActive = (href: string, pathname: string | null) =>
  href === ADMIN_TAB ? pathname === href || Boolean(pathname?.startsWith(`${href}/`)) : pathname === href;

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
  /** El `?mes=` de la URL; las pestañas de Reportes y Admin no lo llevan. */
  month?: string | null;
  showAdmin?: boolean;
}) {
  const labels = useTexts(TAB_TEXTS);
  const tabs: readonly (keyof typeof labels)[] = showAdmin ? [...TABS, ADMIN_TAB] : TABS;
  // En un celular angosto, la franja arranca mostrando la pestaña actual (la de Admin, la última,
  // quedaba cortada).
  const nav = useCurrentInView(pathname);
  // Solo un mes bien escrito: el servidor decide si se puede ver (no futuro).
  const query = parseMonthParam(month) ? `?mes=${month}` : "";
  return (
    // Sin espacio entre pestañas (su padding ya las separa) y, en pantallas angostas, con menos padding:
    // así las cinco de una persona caben en 375 px (con margen: en Linux, la letra sale unos 15 px más
    // ancha que en el Mac). Con Admin son seis: la franja se desliza de lado y
    // arranca mostrando la actual.
    <nav ref={nav} className="-mb-px mt-3 flex overflow-x-auto">
      {tabs.map((href) => {
        const active = isActive(href, pathname);
        const admin = href === ADMIN_TAB;
        // Admin, siempre en el violeta de admin y con su escudo (como la etiqueta y el escudo del menú
        // de la cuenta): se ve desde lejos que es una zona con permisos especiales.
        const look = admin
          ? `inline-flex items-center gap-1 rounded-t-md text-admin ${active ? "border-admin bg-admin-surface" : "border-transparent hover:border-admin-border"}`
          : active
            ? "border-brand text-foreground"
            : "border-transparent text-muted hover:text-foreground";
        return (
          <Link
            key={href}
            href={MONTH_TABS.has(href) ? href + query : href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-1.5 py-2.5 text-sm font-medium transition sm:px-3 ${look}`}
          >
            {admin && <ShieldIcon className="size-3.5" />}
            {labels[href]}
          </Link>
        );
      })}
    </nav>
  );
}
