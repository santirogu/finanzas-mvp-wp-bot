import Link from "next/link";
import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";

const TEXTS = texts(
  {
    heading: "Tus finanzas, tan fácil como mandar un WhatsApp.",
    body: "Escribe “me compré unos zapatos de $500.000” y queda registrado. Revisa tu balance del mes cuando quieras.",
    register: "Crear cuenta",
    login: "Iniciar sesión",
    privacy: "Política de privacidad",
  },
  {
    en: {
      heading: "Your finances, as easy as sending a WhatsApp.",
      // Sin un ejemplo escrito: el bot todavía responde en español.
      body: "Tell the WhatsApp bot what you spent and it's recorded. Check your monthly balance whenever you want.",
      register: "Create account",
      login: "Sign in",
      privacy: "Privacy policy",
    },
  },
);

export default async function Home() {
  const t = await getTexts(TEXTS);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-brand">Finanzas MVP</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{t.heading}</h1>
      <p className="mt-4 text-lg text-muted">{t.body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/registro" className="btn-primary">
          {t.register}
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          {t.login}
        </Link>
      </div>
      <p className="mt-16 text-xs text-muted">
        <Link href="/privacidad" className="underline underline-offset-2 hover:text-foreground">
          {t.privacy}
        </Link>
      </p>
    </main>
  );
}
