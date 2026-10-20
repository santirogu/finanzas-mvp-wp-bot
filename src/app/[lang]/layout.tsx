import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { LocaleProvider } from "@/i18n/client";
import { LOCALES } from "@/i18n/locales";
import { getLocale, getTexts } from "@/i18n/server";
import { THEME_SCRIPT } from "@/lib/theme";
import "../globals.css";
import { APP_TEXTS } from "./app-texts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTexts(APP_TEXTS);
  return { title: { default: t.name, template: `%s · ${t.name}` }, description: t.description };
}

// Cada página se arma una vez por idioma (src/i18n/locales.ts): las públicas quedan prearmadas en todos.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning: el script de tema pone data-theme en <html> antes de que React
    // hidrate, así que en el navegador el atributo no coincide con el HTML del servidor (a propósito).
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* El tema elegido en Mi cuenta (src/lib/theme.ts), antes de pintar: sin parpadeo. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        {/* Vercel Web Analytics y Speed Insights: visitas y velocidad de carga, anónimas y sin
            cookies (ver /privacidad). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
