"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { adminNavItems, isCurrentAdminItem } from "@/modules/admin/modules";

/**
 * Subnavegación de la sección de administración: un chip por módulo activo (src/modules/admin/
 * modules.ts). En celular se desliza de lado dentro de su franja, sin mover la página, y arranca
 * mostrando la sección actual (si no, "Seguridad" quedaba cortada en el borde: "Se…").
 */
export function AdminNav() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    // Solo la franja se desliza (scrollIntoView podría mover también la página). También al girar el
    // celular, que cambia el ancho.
    const showCurrent = () => {
      const strip = nav.current;
      const current = strip?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!strip || !current) return;
      const overflow = current.getBoundingClientRect().right - strip.getBoundingClientRect().right;
      if (overflow > 0) strip.scrollLeft += overflow + 16;
    };
    showCurrent();
    window.addEventListener("resize", showCurrent);
    return () => window.removeEventListener("resize", showCurrent);
  }, [pathname]);
  return (
    <nav ref={nav} aria-label="Secciones de administración" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2 py-1">
        {adminNavItems().map((item) => {
          const current = isCurrentAdminItem(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition ${
                  current
                    ? "border-brand/50 bg-brand/10 font-medium text-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
