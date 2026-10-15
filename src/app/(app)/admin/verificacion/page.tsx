import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdminRole } from "@/lib/session";
import { PageSkeleton } from "../../page-skeleton";
import { TwoFactorSetup } from "./two-factor-setup";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

// Única página de administración que no exige la verificación en dos pasos: es donde se configura.
export default function TwoFactorSetupPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  const user = await requireAdminRole();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm text-muted">Administración</p>
        <h1 className="text-2xl font-semibold tracking-tight">Verificación en dos pasos</h1>
      </div>
      {user.twoFactorEnabled ? (
        <section className="card space-y-2 p-4 text-sm">
          <p className="font-semibold">✓ Está activa</p>
          <p className="text-muted">
            Cada vez que inicies sesión te pediremos el código de Google Authenticator. Si pierdes el
            celular, usa un código de respaldo; si tampoco los tienes, se reinicia desde la terminal
            con <code>pnpm admin:reset-2fa</code> (README → Roles).
          </p>
          <Link href="/admin" className="inline-block font-medium text-brand">
            Ir a Administración
          </Link>
        </section>
      ) : (
        <>
          <p className="text-sm text-muted">
            Para entrar a la sección de administración necesitas un segundo paso al iniciar sesión: un
            código que cambia cada 30 segundos en tu celular. Así, aunque alguien sepa tu contraseña, no
            puede entrar sin tu celular.
          </p>
          <TwoFactorSetup />
        </>
      )}
    </div>
  );
}
