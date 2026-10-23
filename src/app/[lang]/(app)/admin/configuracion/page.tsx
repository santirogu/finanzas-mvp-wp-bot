import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { requireAdmin } from "@/lib/session";
import { getSignupSettings } from "@/modules/admin/configuracion/signup";
import { formatDate, formatDateTime } from "@/modules/admin/shared/filters";
import { PageSkeleton } from "../../page-skeleton";
import { adminMetadata } from "../admin-metadata";
import { SignupSettings } from "./signup-settings";

export async function generateMetadata(): Promise<Metadata> {
  return adminMetadata("configuracion");
}

const TEXTS = texts({ someAdmin: "Un admin" }, { en: { someAdmin: "An admin" } });

// Lee la sesión y la base: va dentro de Suspense (Cache Components).
export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminSettings />
    </Suspense>
  );
}

/**
 * La configuración de la app, para todas las cuentas. Por ahora, los registros (quién puede crear una cuenta);
 * lo que venga (un aviso para todos, los valores de las cuentas nuevas…) va aquí como otra tarjeta.
 */
async function AdminSettings() {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();
  const locale = await getLocale();
  const settings = await getSignupSettings();

  return (
    <div className="space-y-4">
      <SignupSettings
        mode={settings.mode}
        invites={settings.invites.map((invite) => ({
          email: invite.email,
          date: formatDate(invite.usedAt ?? invite.invitedAt, locale),
          used: invite.usedAt !== null,
        }))}
        lastChange={settings.updated && `${settings.updated.by ?? TEXTS[locale].someAdmin} · ${formatDateTime(settings.updated.at, locale)}`}
      />
    </div>
  );
}
