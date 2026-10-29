import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { BRAND_NAME } from "@/lib/brand";
import { getAppValues } from "@/modules/app-values/current";
import { PageSkeleton } from "../(app)/page-skeleton";
import { HELP_TEXTS, HelpContent } from "../(app)/ayuda/help-content";

// La Ayuda para quien no tiene sesión: el proxy la arma en /ayuda (src/proxy.ts), la misma dirección de la Ayuda de
// la app. Dice lo mismo, con la barra de la portada en vez de las pestañas y sin el tutorial de bienvenida.

const TEXTS = texts(
  {
    description: `Cómo usar ${BRAND_NAME}: registrar tus movimientos, el bot de WhatsApp, los gastos fijos, los presupuestos, los reportes y las preguntas frecuentes.`,
    login: "Iniciar sesión",
    privacy: "Política de privacidad",
  },
  {
    en: {
      description: `How to use ${BRAND_NAME}: adding your transactions, the WhatsApp bot, bills, budgets, reports and frequently asked questions.`,
      login: "Sign in",
      privacy: "Privacy policy",
    },
  },
);

export async function generateMetadata(): Promise<Metadata> {
  const [help, t] = await Promise.all([getTexts(HELP_TEXTS), getTexts(TEXTS)]);
  return { title: help.title, description: t.description };
}

export default async function PublicHelpPage() {
  const t = await getTexts(TEXTS);
  return (
    <div className="flex flex-1 flex-col">
      {/* Como en la portada: en una pantalla muy angosta (320 px), el idioma e "Iniciar sesión" pasan a una segunda
          fila en vez de salirse de la pantalla. */}
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link href="/" className="text-xl">
          <Logo markClassName="size-8" />
        </Link>
        <div className="flex items-center gap-2">
          {/* La dirección es /ayuda, aunque por dentro la página sea /ayuda-publica: vuelve ahí. */}
          <LanguageSwitch to="/ayuda" />
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface sm:px-4 pointer-fine:min-h-9"
          >
            {t.login}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 sm:px-6">
        <Suspense fallback={<PageSkeleton />}>
          <PublicHelp />
        </Suspense>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-10 text-xs text-muted sm:px-6">
        <Link href="/privacidad" className="underline underline-offset-2 hover:text-foreground">
          {t.privacy}
        </Link>
      </footer>
    </div>
  );
}

async function PublicHelp() {
  // Los valores de la app (los que eligió el admin) se leen en cada pedido, no al compilar.
  await connection();
  const [locale, values] = await Promise.all([getLocale(), getAppValues()]);
  return <HelpContent locale={locale} values={values} signedIn={false} />;
}
