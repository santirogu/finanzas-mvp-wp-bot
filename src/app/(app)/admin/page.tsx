import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/session";
import { historySummary } from "@/modules/admin/history/events-log";
import { ADMIN_MODULES, type AdminModuleId } from "@/modules/admin/modules";
import { usersSummary } from "@/modules/admin/users/users";
import { PageSkeleton } from "../page-skeleton";
import { ModuleIcon } from "./module-icon";

export const metadata: Metadata = { title: "Administración" };

// Inicio de la administración: una tarjeta por módulo (src/modules/admin/modules.ts), con un resumen
// de los activos. Los que vienen se anuncian como "Pronto".
export default function AdminHomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();
  const [history, users] = await Promise.all([historySummary(), usersSummary()]);
  const summaries: Partial<Record<AdminModuleId, string>> = {
    historial: `${history.today} ${history.today === 1 ? "evento" : "eventos"} hoy · ${history.failedToday} ${
      history.failedToday === 1 ? "intento fallido" : "intentos fallidos"
    }`,
    usuarios: `${users.total} ${users.total === 1 ? "cuenta" : "cuentas"} · ${users.withWhatsApp} con WhatsApp`,
    seguridad: "Verificación en dos pasos activa",
  };

  return (
    <ul aria-label="Módulos de administración" className="grid gap-3 sm:grid-cols-2">
      {ADMIN_MODULES.map((adminModule) => {
        const body = (
          <>
            <ModuleIcon id={adminModule.id} />
            <div className="min-w-0 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {adminModule.label}
                {adminModule.status === "pronto" && (
                  <span className="rounded-full border border-border px-2 text-xs font-normal text-muted">Pronto</span>
                )}
              </p>
              <p className="text-sm text-muted">{adminModule.description}</p>
              {summaries[adminModule.id] && <p className="text-sm">{summaries[adminModule.id]}</p>}
            </div>
          </>
        );
        return (
          <li key={adminModule.id}>
            {adminModule.status === "activo" ? (
              <Link href={adminModule.href} className="card flex h-full gap-3 p-4 transition hover:border-brand/40">
                {body}
              </Link>
            ) : (
              <div className="flex h-full gap-3 rounded-xl border border-dashed border-border p-4">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
