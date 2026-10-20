import type { Metadata } from "next";
import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { AuthForm } from "../auth-form";

const TEXTS = texts({ title: "Crear cuenta" }, { en: { title: "Create account" } });

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
