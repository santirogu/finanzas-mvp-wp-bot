import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { hasRole, roleLabel } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { PageSkeleton } from "../page-skeleton";
import { ChangePassword } from "./change-password";
import { DeleteAccountForm } from "./delete-account-form";
import { WhatsAppCard } from "./whatsapp-card";

const TEXTS = texts(
  {
    title: "Mi cuenta",
    data: "Tus datos",
    name: "Nombre",
    email: "Correo",
    changeEmail: "Cambiar correo",
    changeEmailSoon: "Pronto: cuando podamos enviarte un correo para confirmarlo",
    role: "Tipo de cuenta",
    currency: "Moneda",
    currencySoon: "Pronto: USD y EUR",
    currencies: { COP: "Peso colombiano" } as Record<string, string>,
    soon: "Pronto",
    settings: "¿Buscas los presupuestos, los avisos, la apariencia o el idioma? Están en",
    settingsLink: "Configuración",
    deleteTitle: "Eliminar mi cuenta",
    deleteIntro: "Se borra todo de inmediato y no se puede deshacer:",
    deleteItems: ["tu cuenta y tu sesión;", "todos tus ingresos, egresos y categorías;", "el vínculo con tu WhatsApp y los mensajes que le enviaste al bot."],
  },
  {
    en: {
      title: "My account",
      data: "Your details",
      name: "Name",
      email: "Email",
      changeEmail: "Change email",
      changeEmailSoon: "Soon: once we can send you an email to confirm it",
      role: "Account type",
      currency: "Currency",
      currencySoon: "Soon: USD and EUR",
      currencies: { COP: "Colombian peso" },
      soon: "Soon",
      settings: "Looking for budgets, notices, appearance or language? They're in",
      settingsLink: "Settings",
      deleteTitle: "Delete my account",
      deleteIntro: "Everything is deleted right away and it can't be undone:",
      deleteItems: ["your account and your session;", "all your income, expenses and categories;", "the link to your WhatsApp and the messages you sent to the bot."],
    },
  },
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const user = await requireUser();
  const locale = await getLocale();
  const t = TEXTS[locale];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        {/* Lo que estaba aquí y pasó a Configuración: quien lo busca en Mi cuenta encuentra el camino. */}
        <p className="mt-1 text-sm text-muted">
          {t.settings}{" "}
          <Link href="/configuracion" className="font-medium text-brand underline-offset-2 hover:underline">
            {t.settingsLink}
          </Link>
          .
        </p>
      </div>

      <section className="card p-4 text-sm" aria-labelledby="tus-datos">
        <h2 id="tus-datos" className="font-semibold">
          {t.data}
        </h2>
        <dl className="divide-y divide-border">
          <DataRow label={t.name}>{user.name}</DataRow>
          <DataRow
            label={t.email}
            action={
              // Pronto: cuando la app pueda enviar correos para confirmar el nuevo (sin eso, un correo mal
              // escrito dejaría a la persona sin poder entrar).
              <span className="flex shrink-0 items-center gap-2">
                <Soon label={t.soon} />
                <button
                  type="button"
                  disabled
                  title={t.changeEmailSoon}
                  className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-medium text-muted disabled:cursor-not-allowed pointer-fine:min-h-9"
                >
                  {t.changeEmail}
                </button>
              </span>
            }
          >
            <span className="break-all">{user.email}</span>
          </DataRow>
          <DataRow label={t.role}>{roleLabel(user.role, user.superAdmin, locale)}</DataRow>
          <DataRow label={t.currency} action={<Soon label={t.currencySoon} />}>
            {t.currencies[user.currency] ? `${t.currencies[user.currency]} (${user.currency})` : user.currency}
          </DataRow>
        </dl>
      </section>

      {/* Un admin con la verificación en dos pasos confirma también con su código. */}
      <ChangePassword needsCode={hasRole(user.role, "admin") && user.twoFactorEnabled} />

      <WhatsAppCard />

      <section className="card space-y-4 border-danger/40 p-4">
        <div className="space-y-2 text-sm">
          <h2 className="font-semibold text-danger">{t.deleteTitle}</h2>
          <p>{t.deleteIntro}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {t.deleteItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <DeleteAccountForm />
      </section>
    </div>
  );
}

/** Una fila de "Tus datos": el nombre del dato, su valor y, a la derecha, lo que se puede hacer con él. */
function DataRow({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  // dt y dd van directo en su div (lo exige el <dl>): la acción, dentro del dd, junto al valor.
  return (
    <div className="py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="min-w-0">{children}</span>
        {action}
      </dd>
    </div>
  );
}

/** Lo que viene ("Pronto"), como en los módulos de la administración. */
function Soon({ label }: { label: string }) {
  return <span className="whitespace-nowrap rounded-full border border-border px-2 text-xs text-muted">{label}</span>;
}
