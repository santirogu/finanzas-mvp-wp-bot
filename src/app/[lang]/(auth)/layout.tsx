import Link from "next/link";
import { Suspense } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { SiteNotice } from "@/components/site-notice";

// Entrar, crear la cuenta y los dos pasos del admin: el formulario al centro y, arriba, el logo, que
// lleva al inicio, y el selector de idioma (sin sesión no se sabe cuál prefiere: por defecto, español).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex justify-end px-4 pt-4">
        <LanguageSwitch />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-12 pt-4">
        {/* El aviso para todos de la administración (un mantenimiento, por ejemplo), también sin sesión. */}
        <Suspense fallback={null}>
          <SiteNotice className="w-full max-w-md" />
        </Suspense>
        <Link href="/" className="text-xl">
          <Logo markClassName="size-8" />
        </Link>
        {children}
      </main>
    </div>
  );
}
