import Link from "next/link";
import { Suspense } from "react";
import { NavTabs, TabLinks } from "./nav-tabs";
import { UserMenu } from "./user-menu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Finanzas <span className="text-brand">MVP</span>
          </Link>
          {/* La sesión se lee dentro de Suspense para no bloquear el resto del layout. */}
          <Suspense fallback={<div className="h-8 w-32 animate-pulse rounded-lg bg-border/60" />}>
            <UserMenu />
          </Suspense>
        </div>
        <div className="mx-auto max-w-5xl px-4">
          {/* En rutas con un id en la URL, la ruta actual se conoce recién en cada request
              (Cache Components): mientras tanto, las pestañas sin ninguna marcada. */}
          <Suspense fallback={<TabLinks pathname={null} />}>
            <NavTabs />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
