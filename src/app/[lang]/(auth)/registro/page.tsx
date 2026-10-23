import type { Metadata } from "next";
import { Suspense } from "react";
import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { AuthForm } from "../auth-form";
import { SignupNotice } from "./signup-notice";

const TEXTS = texts({ title: "Crear cuenta" }, { en: { title: "Create account" } });

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

export default function RegisterPage() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* Cómo están los registros se lee en cada request (Cache Components): mientras tanto, sin aviso. */}
      <Suspense fallback={null}>
        <SignupNotice />
      </Suspense>
      <AuthForm mode="register" />
    </div>
  );
}
