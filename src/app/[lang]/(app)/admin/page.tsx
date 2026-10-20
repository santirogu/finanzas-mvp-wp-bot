import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { requireAdmin } from "@/lib/session";
import { botSummary } from "@/modules/admin/bot/bot-activity";
import { categoriesSummary } from "@/modules/admin/categories/categories";
import { historySummary } from "@/modules/admin/history/events-log";
import { adminModules, adminTitle, type AdminModuleId } from "@/modules/admin/modules";
import { usersSummary } from "@/modules/admin/users/users";
import { PageSkeleton } from "../page-skeleton";
import { ModuleIcon } from "./module-icon";

export async function generateMetadata(): Promise<Metadata> {
  return { title: adminTitle(null, await getLocale()) };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const TEXTS = texts(
  {
    history: (today: number, failed: number) => `${plural(today, "evento", "eventos")} hoy · ${plural(failed, "intento fallido", "intentos fallidos")}`,
    accounts: (n: number) => plural(n, "cuenta", "cuentas"),
    withWhatsApp: (n: number) => `${n} con WhatsApp`,
    suspended: (n: number) => plural(n, "suspendida", "suspendidas"),
    paused: "Claude en pausa · ",
    limit: "Tope mensual alcanzado · ",
    bot: (today: number, failed: number) => `${plural(today, "mensaje", "mensajes")} hoy · ${plural(failed, "error", "errores")}`,
    categories: (expense: number, income: number) => `${expense} de egresos · ${income} de ingresos`,
    security: "Verificación en dos pasos activa",
    modules: "Módulos de administración",
    soon: "Pronto",
  },
  {
    en: {
      history: (today, failed) => `${plural(today, "event", "events")} today · ${plural(failed, "failed attempt", "failed attempts")}`,
      accounts: (n) => plural(n, "account", "accounts"),
      withWhatsApp: (n) => `${n} with WhatsApp`,
      suspended: (n) => `${n} suspended`,
      paused: "Claude paused · ",
      limit: "Monthly limit reached · ",
      bot: (today, failed) => `${plural(today, "message", "messages")} today · ${plural(failed, "error", "errors")}`,
      categories: (expense, income) => `${expense} for expenses · ${income} for income`,
      security: "Two-step verification on",
      modules: "Administration modules",
      soon: "Soon",
    },
  },
);

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
  const locale = await getLocale();
  const t = TEXTS[locale];
  const [history, users, bot, categories] = await Promise.all([historySummary(), usersSummary(), botSummary(), categoriesSummary()]);
  const summaries: Partial<Record<AdminModuleId, string>> = {
    historial: t.history(history.today, history.failedToday),
    usuarios: [t.accounts(users.total), t.withWhatsApp(users.withWhatsApp), ...(users.suspended > 0 ? [t.suspended(users.suspended)] : [])].join(" · "),
    bot: `${bot.claudePaused ? t.paused : bot.monthlyLimitReached ? t.limit : ""}${t.bot(bot.today, bot.failedToday)}`,
    categorias: t.categories(categories.expense, categories.income),
    seguridad: t.security,
  };

  return (
    <ul aria-label={t.modules} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {adminModules(locale).map((adminModule) => {
        const body = (
          <>
            <ModuleIcon id={adminModule.id} />
            <div className="min-w-0 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {adminModule.label}
                {adminModule.status === "pronto" && (
                  <span className="rounded-full border border-border px-2 text-xs font-normal text-muted">{t.soon}</span>
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
