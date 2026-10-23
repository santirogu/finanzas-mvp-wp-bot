import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { currentMonthRange, formatMonthName } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { getBudgetProgress, listBudgetCategories } from "@/modules/budgets/budgets";
import { budgetRows } from "@/modules/budgets/progress";
import { getUpcomingSettings } from "@/modules/reports/upcoming-settings";
import { PageSkeleton } from "../page-skeleton";
import { Budgets } from "./budgets";
import { LanguagePicker } from "./language-picker";
import { NotificationSettings } from "./notification-settings";
import { ThemePicker } from "./theme-picker";

const TEXTS = texts(
  {
    title: "Configuración",
    intro: "Cómo funciona la app para ti.",
    contents: "En esta página",
    sections: { presupuestos: "Presupuestos", notificaciones: "Notificaciones", apariencia: "Apariencia", idioma: "Idioma" },
    appearance: "Apariencia",
    appearanceIntro:
      "Con “Sistema”, la app se ve clara u oscura según tu celular o computador. Se guarda en tu cuenta: la ves así en cualquier dispositivo donde inicies sesión.",
    language: "Idioma",
    languageIntro: "Se guarda en tu cuenta: ves la app en este idioma en cualquier dispositivo donde inicies sesión. El bot de WhatsApp sigue respondiendo en español.",
  },
  {
    en: {
      title: "Settings",
      intro: "How the app works for you.",
      contents: "On this page",
      sections: { presupuestos: "Budgets", notificaciones: "Notifications", apariencia: "Appearance", idioma: "Language" },
      appearance: "Appearance",
      appearanceIntro:
        "With “System”, the app looks light or dark depending on your phone or computer. It's saved to your account: you see it this way on any device where you sign in.",
      language: "Language",
      languageIntro: "It's saved to your account: you see the app in this language on any device where you sign in. The WhatsApp bot still answers in Spanish.",
    },
  },
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

// Lee la sesión: va dentro de Suspense (Cache Components).
export default function ConfiguracionPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

/**
 * Configuración (en el menú de la cuenta, junto a Mi cuenta): cómo funciona la app para la persona. Presupuestos,
 * los avisos de próximos pagos, la apariencia y el idioma; lo que se agregue después (la moneda, el recordatorio de
 * registro…) va aquí como otra sección. Mi cuenta se queda con quién es y su seguridad (decisión del dueño).
 */
async function Settings() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = TEXTS[locale];
  const current = currentMonthRange(user.timezone);
  const [progress, options, notifications] = await Promise.all([
    getBudgetProgress(user.id, current, locale),
    listBudgetCategories(user.id, locale),
    getUpcomingSettings(user.id),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.intro}</p>
      </div>

      <nav aria-label={t.contents}>
        <ul className="flex flex-wrap gap-2">
          {Object.entries(t.sections).map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm font-medium transition hover:bg-surface pointer-fine:min-h-8"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Budgets rows={budgetRows(progress, user.currency, locale)} options={options} month={formatMonthName(current, { locale })} />

      <NotificationSettings {...notifications} />

      <section className="card scroll-mt-4 space-y-3 p-4 text-sm" aria-labelledby="apariencia">
        <div className="space-y-1">
          <h2 id="apariencia" className="font-semibold">
            {t.appearance}
          </h2>
          <p className="text-muted">{t.appearanceIntro}</p>
        </div>
        <ThemePicker />
      </section>

      <section className="card scroll-mt-4 space-y-3 p-4 text-sm" aria-labelledby="idioma">
        <div className="space-y-1">
          <h2 id="idioma" className="font-semibold">
            {t.language}
          </h2>
          <p className="text-muted">{t.languageIntro}</p>
        </div>
        <LanguagePicker />
      </section>
    </div>
  );
}
