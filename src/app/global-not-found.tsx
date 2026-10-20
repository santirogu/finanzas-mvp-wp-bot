import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import { APP_TEXTS } from "./[lang]/app-texts";
import { NOT_FOUND_TEXTS, NotFoundContent } from "./[lang]/not-found-content";
import "./globals.css";

// La 404 de lo que no es una página, como una ruta de la API que no existe (las direcciones de páginas
// que no existen las atiende [lang]/[...rest]). Next la arma sin el layout de src/app/[lang]/, así que
// trae su propio <html>, la fuente y el tema; va en español: fuera de las páginas no hay idioma.

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = { title: `${NOT_FOUND_TEXTS.es.title} · ${APP_TEXTS.es.name}` };

export default function GlobalNotFound() {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <NotFoundContent text={NOT_FOUND_TEXTS.es} />
      </body>
    </html>
  );
}
