import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { requireAdmin } from "@/lib/session";
import { getNoticeSettings } from "@/modules/admin/configuracion/notice";
import { getSignupSettings } from "@/modules/admin/configuracion/signup";
import { getAppValuesSettings } from "@/modules/admin/configuracion/values";
import { toBogotaDateTime } from "@/modules/notice/notice";
import { formatDate, formatDateTime } from "@/modules/admin/shared/filters";
import { PageSkeleton } from "../../page-skeleton";
import { adminMetadata } from "../admin-metadata";
import { NoticeSettings } from "./notice-settings";
import { SignupSettings } from "./signup-settings";
import { ValuesSettings } from "./values-settings";

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
 * La configuración de la app, para todas las cuentas: los registros (quién puede crear una cuenta), el aviso para
 * todos y los valores de la app (los avisos por defecto y los umbrales). Lo que venga va aquí como otra tarjeta.
 */
async function AdminSettings() {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();
  const locale = await getLocale();
  const [settings, notice, appValues] = await Promise.all([getSignupSettings(), getNoticeSettings(), getAppValuesSettings()]);
  const t = TEXTS[locale];

  return (
    <div className="space-y-4">
      <SignupSettings
        mode={settings.mode}
        invites={settings.invites.map((invite) => ({
          email: invite.email,
          date: formatDate(invite.usedAt ?? invite.invitedAt, locale),
          used: invite.usedAt !== null,
        }))}
        lastChange={settings.updated && `${settings.updated.by ?? t.someAdmin} · ${formatDateTime(settings.updated.at, locale)}`}
      />
      <NoticeSettings
        notice={
          notice && {
            message: notice.message,
            messageEn: notice.messageEn,
            tone: notice.tone,
            endsAtInput: toBogotaDateTime(notice.endsAt),
            endsAtLabel: formatDateTime(notice.endsAt, locale),
            active: notice.active,
            published: `${notice.published.by ?? t.someAdmin} · ${formatDateTime(notice.published.at, locale)}`,
          }
        }
      />
      <ValuesSettings
        values={appValues.values}
        lastChange={appValues.updated && `${appValues.updated.by ?? t.someAdmin} · ${formatDateTime(appValues.updated.at, locale)}`}
      />
    </div>
  );
}
