import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getDictionary, getLocale } from "@/i18n/server";
import { LOCALES } from "@/i18n/locales";
import { THEME_SCRIPT } from "@/lib/theme";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getDictionary();
  return { title: { default: meta.title, template: `%s · ${meta.title}` }, description: meta.description };
}

// Cada página se arma una vez por idioma (src/i18n/locales.ts): las públicas quedan prearmadas en todos.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    // suppressHydrationWarning: el script de tema pone data-theme en <html> antes de que React
    // hidrate, así que en el navegador el atributo no coincide con el HTML del servidor (a propósito).
    <html
      lang={await getLocale()}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* El tema elegido en Mi cuenta (src/lib/theme.ts), antes de pintar: sin parpadeo. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        {/* Vercel Web Analytics y Speed Insights: visitas y velocidad de carga, anónimas y sin
            cookies (ver /privacidad). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
