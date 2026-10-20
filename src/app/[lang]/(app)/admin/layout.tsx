import { Suspense } from "react";
import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { requireAdminRole } from "@/lib/session";

const TEXTS = texts(
  { only: "Solo para administradores", title: "Administración" },
  { en: { only: "For administrators only", title: "Administration" } },
);
import { AdminNav } from "./admin-nav";

// El marco de todos los módulos de administración: título y subnavegación. No protege nada por sí
// solo (en Next, las páginas no esperan al layout): cada página, acción y consulta de admin valida
// el rol por su cuenta (requireAdmin). Aquí se valida igual antes de dibujar el marco, para que a
// quien no es admin no le llegue ni el título ni los nombres de los módulos (recibe el 404).
export default function AdminLayout({ children }: LayoutProps<"/[lang]/admin">) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Suspense fallback={<div className="h-20" aria-hidden />}>
        <AdminHeader />
      </Suspense>
      {children}
    </div>
  );
}

async function AdminHeader() {
  // Solo el rol (no la verificación en dos pasos): el marco también rodea la página de Seguridad,
  // donde se configura.
  await requireAdminRole();
  const t = await getTexts(TEXTS);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted">{t.only}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
      </div>
      <AdminNav />
    </div>
  );
}
