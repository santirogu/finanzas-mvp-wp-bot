import type { Metadata } from "next";
import { Suspense } from "react";
import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { AuthForm } from "../auth-form";
import { ExpiredSessionNotice } from "./expired-session-notice";

const TEXTS = texts({ title: "Iniciar sesión" }, { en: { title: "Sign in" } });

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

export default function LoginPage() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* La URL se lee en cada request (Cache Components): mientras tanto, sin aviso. */}
      <Suspense fallback={null}>
        <ExpiredSessionNotice />
      </Suspense>
      <AuthForm mode="login" />
    </div>
  );
}
