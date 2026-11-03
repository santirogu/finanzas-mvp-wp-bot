import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { PrivacySummary } from "@/components/privacy-summary";
import { BRAND_NAME } from "@/lib/brand";
import { hasCurrentConsent } from "@/lib/privacy";
import { requireSignedIn } from "@/lib/session";
import { signOutAction } from "@/modules/account/sign-out";
import { DeleteAccountForm } from "../(app)/cuenta/delete-account-form";
import { ConsentForm } from "./consent-form";

const TEXTS = texts(
  {
    title: "Autoriza el uso de tus datos",
    intro: `Para seguir usando ${BRAND_NAME} necesitamos tu autorización para tratar tus datos personales, como pide la ley de protección de datos de Colombia (Ley 1581 de 2012).`,
    policy: "Lee la política de privacidad completa",
    disagree: "¿No estás de acuerdo?",
    disagreeText: "Sin tu autorización no puedes seguir usando la app. Puedes cerrar sesión o eliminar tu cuenta y todos tus datos.",
    signOut: "Cerrar sesión",
    deleteTitle: "Eliminar mi cuenta",
  },
  {
    en: {
      title: "Authorize the use of your data",
      intro: `To keep using ${BRAND_NAME} we need your authorization to process your personal data, as Colombia's data protection law requires (Law 1581 of 2012).`,
      policy: "Read the full privacy policy (in Spanish)",
      disagree: "Don't agree?",
      disagreeText: "Without your authorization you can't keep using the app. You can sign out or delete your account and all your data.",
      signOut: "Sign out",
      deleteTitle: "Delete my account",
    },
  },
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

/**
 * Donde una cuenta sin la autorización vigente de sus datos la da (src/lib/privacy.ts): las de antes de pedirla, o
 * todas si cambia la versión de la política. requireUser manda aquí; con la autorización, al Resumen.
 */
export default function PrivacyConsentPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 pb-12 pt-8">
      <Link href="/" className="text-xl">
        <Logo markClassName="size-8" />
      </Link>
      <Suspense fallback={null}>
        <Consent />
      </Suspense>
    </main>
  );
}

async function Consent() {
  const user = await requireSignedIn();
  if (hasCurrentConsent(user.privacyVersion)) redirect("/dashboard");
  const locale = await getLocale();
  const t = TEXTS[locale];

  return (
    <div className="mt-8 w-full max-w-xl space-y-6">
      <section className="card space-y-4 p-6 sm:p-8">
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="text-sm text-muted">{t.intro}</p>
        <PrivacySummary />
        <p className="text-sm">
          <Link href="/privacidad" target="_blank" className="font-medium text-brand underline underline-offset-2">
            {t.policy}
          </Link>
        </p>
        <ConsentForm />
      </section>

      <section className="card space-y-4 p-6 text-sm" aria-labelledby="no-autorizar">
        <div className="space-y-1">
          <h2 id="no-autorizar" className="font-semibold">
            {t.disagree}
          </h2>
          <p className="text-muted">{t.disagreeText}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium hover:bg-background pointer-fine:min-h-9"
          >
            {t.signOut}
          </button>
        </form>
        <details className="border-t border-border pt-3">
          <summary className="cursor-pointer font-medium text-danger">{t.deleteTitle}</summary>
          <div className="mt-3">
            <DeleteAccountForm />
          </div>
        </details>
      </section>
    </div>
  );
}
