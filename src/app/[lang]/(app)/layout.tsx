import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Toaster, UrlToasts } from "@/components/toaster";
import { hasRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { NavTabs, TabLinks } from "./nav-tabs";
import { UserMenu } from "./user-menu";
import { UserNotifications } from "./user-notifications";

/** Las pestañas, con "Admin" solo para quien tiene el rol (lo decide el servidor). */
async function UserNavTabs() {
  const user = await requireUser();
  return <NavTabs showAdmin={hasRole(user.role, "admin")} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Toaster>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-border bg-surface">
          {/* relative: la lista de la campana se abre, en pantallas angostas, a lo ancho de esta fila. */}
          <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-4">
            <Link href="/dashboard" className="text-lg">
              <Logo />
            </Link>
            <div className="flex items-center gap-2">
              {/* La sesión se lee dentro de Suspense para no bloquear el resto del layout. La campana aparece
                  cuando llega (y no aparece con los avisos apagados). */}
              <Suspense fallback={null}>
                <UserNotifications />
              </Suspense>
              <Suspense fallback={<div className="h-11 w-16 animate-pulse rounded-full bg-border/60 pointer-fine:h-[2.625rem]" />}>
                <UserMenu />
              </Suspense>
            </div>
          </div>
          <div className="mx-auto max-w-5xl px-4">
            {/* La sesión (¿es admin?) y, en rutas con un id en la URL, la ruta actual se conocen
                recién en cada request (Cache Components): mientras tanto, las pestañas sin marcar. */}
            <Suspense fallback={<TabLinks pathname={null} />}>
              <UserNavTabs />
            </Suspense>
          </div>
        </header>
        {/* id y tabIndex: si un aviso con el foco se cierra, el foco vuelve aquí (src/components/toaster.tsx). */}
        <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none sm:py-8">
          {children}
        </main>
      </div>
      {/* Los avisos que pide la URL (?aviso=guardado), después de una redirección del servidor. */}
      <Suspense fallback={null}>
        <UrlToasts />
      </Suspense>
    </Toaster>
  );
}
