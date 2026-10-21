import type { Metadata } from "next";
import Link from "next/link";
import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";

const TEXTS = texts(
  {
    title: "Cuenta eliminada",
    heading: "Tu cuenta fue eliminada",
    body: "Borramos tu cuenta, tus movimientos y los mensajes que le enviaste al bot de WhatsApp. Gracias por haber usado Anotado.",
    home: "Ir al inicio",
    register: "Crear una cuenta nueva",
  },
  {
    en: {
      title: "Account deleted",
      heading: "Your account was deleted",
      body: "We deleted your account, your transactions and the messages you sent to the WhatsApp bot. Thanks for using Anotado.",
      home: "Go to home",
      register: "Create a new account",
    },
  },
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

// Pública: se llega aquí justo después de eliminar la cuenta, ya sin sesión.
export default async function AccountDeletedPage() {
  const t = await getTexts(TEXTS);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t.heading}</h1>
      <p className="mt-3 text-muted">{t.body}</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="rounded-lg border border-border px-4 py-2 font-medium">
          {t.home}
        </Link>
        <Link href="/registro" className="btn-primary">
          {t.register}
        </Link>
      </div>
    </main>
  );
}
