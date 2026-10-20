import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTexts } from "@/i18n/server";
import { NOT_FOUND_TEXTS } from "../not-found-content";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(NOT_FOUND_TEXTS)).title };
}

// Una dirección que no es ninguna página: la 404 del idioma de la página (../not-found.tsx). Sin esto,
// Next mostraría src/app/global-not-found.tsx, que no conoce el idioma.
export default function UnknownPage() {
  notFound();
}
