import type { ReactNode } from "react";
import type { AdminModuleId } from "@/modules/admin/modules";

// Ícono (decorativo) y color de cada módulo de administración.
const PATHS: Record<AdminModuleId, ReactNode> = {
  historial: <path d="M10 5.5V10l3 2M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />,
  usuarios: (
    <>
      <circle cx="7.5" cy="7" r="2.5" />
      <path d="M2.5 16c.5-2.6 2.5-4 5-4s4.5 1.4 5 4M13 4.8a2.5 2.5 0 0 1 0 4.4M14.5 12.3c1.6.5 2.7 1.8 3 3.7" />
    </>
  ),
  bot: <path d="M4 15.5 4.8 12A6 6 0 1 1 8 15.4L4 15.5zM7.5 9h.01M10 9h.01M12.5 9h.01" />,
  categorias: <path d="M3.5 3.5h5l8 8-5 5-8-8v-5zM6.5 6.5h.01" />,
  salud: <path d="M2.5 10h3l2-5 3 10 2-5h5" />,
  configuracion: (
    <>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" />
    </>
  ),
  seguridad: <path d="M10 2.5 3.5 5v4.5c0 4 2.8 7 6.5 8 3.7-1 6.5-4 6.5-8V5L10 2.5zM7.5 10l2 2 3.5-3.5" />,
};

const COLORS: Record<AdminModuleId, string> = {
  historial: "bg-brand/10 text-brand",
  usuarios: "bg-admin-surface text-admin",
  bot: "bg-income/10 text-income",
  categorias: "bg-expense/10 text-expense",
  salud: "bg-danger/10 text-danger",
  configuracion: "bg-border text-muted",
  seguridad: "bg-border text-foreground",
};

export function ModuleIcon({ id }: { id: AdminModuleId }) {
  return (
    <span className={`flex size-8 flex-none items-center justify-center rounded-lg ${COLORS[id]}`} aria-hidden>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
        {PATHS[id]}
      </svg>
    </span>
  );
}
