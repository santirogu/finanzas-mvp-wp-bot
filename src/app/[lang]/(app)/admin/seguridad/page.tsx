import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { requireAdminRole } from "@/lib/session";
import { PageSkeleton } from "../../page-skeleton";
import { TwoFactorSetup } from "./two-factor-setup";
import { adminMetadata } from "../admin-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return adminMetadata("seguridad");
}

const TEXTS = texts(
  {
    title: "Verificación en dos pasos",
    on: "✓ Está activa",
    onBody:
      "Cada vez que inicies sesión te pediremos el código de Google Authenticator. Si pierdes el celular, usa uno de tus códigos de respaldo; si tampoco los tienes, se reinicia desde la terminal con",
    onBodyEnd: "(README → Roles).",
    goToAdmin: "Ir a Administración",
    intro:
      "Para entrar a la sección de administración necesitas un segundo paso al iniciar sesión: un código que cambia cada 30 segundos en tu celular. Así, aunque alguien sepa tu contraseña, no puede entrar sin tu celular.",
  },
  {
    en: {
      title: "Two-step verification",
      on: "✓ It's on",
      onBody:
        "Every time you sign in we'll ask for the Google Authenticator code. If you lose your phone, use one of your backup codes; if you don't have those either, it's reset from the terminal with",
      onBodyEnd: "(README → Roles).",
      goToAdmin: "Go to Administration",
      intro:
        "To enter the administration section you need a second step when signing in: a code that changes every 30 seconds on your phone. That way, even if someone knows your password, they can't get in without your phone.",
    },
  },
);

// Seguridad: la única página de administración que no exige la verificación en dos pasos, porque es
// donde se configura (requireAdminRole).
export default function TwoFactorSetupPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  const user = await requireAdminRole();
  const t = await getTexts(TEXTS);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t.title}</h2>
      {user.twoFactorEnabled ? (
        <section className="card space-y-2 p-4 text-sm">
          <p className="font-semibold">{t.on}</p>
          <p className="text-muted">
            {t.onBody} <code>pnpm admin:reset-2fa</code> {t.onBodyEnd}
          </p>
          <Link href="/admin" className="inline-block font-medium text-brand">
            {t.goToAdmin}
          </Link>
        </section>
      ) : (
        <>
          <p className="text-sm text-muted">{t.intro}</p>
          <TwoFactorSetup />
        </>
      )}
    </div>
  );
}
