import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeSync } from "@/components/theme-sync";
import { LocaleProvider } from "@/i18n/client";
import { LOCALES } from "@/i18n/locales";
import { getLocale, getTexts } from "@/i18n/server";
import { getAppUrl } from "@/lib/app-url";
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
  const shareImage = { url: "/opengraph-image.png", width: 1200, height: 630, alt: t.shareImage };
  return {
    title: { default: t.name, template: `%s · ${t.name}` },
    description: t.description,
    applicationName: t.name,
    // Para que la imagen para compartir vaya con la dirección completa. La portada se arma al compilar:
    // la URL sale del build (APP_PUBLIC_URL, en getAppUrl), no del pedido.
    metadataBase: new URL(getAppUrl()),
    // La vista previa al compartir el enlace (WhatsApp, redes), con la imagen de src/app/opengraph-image.png
    // (scripts/brand-assets.mjs): Next no la agrega sola porque el layout raíz está en [lang]. Los íconos y
    // el manifest sí salen solos de los archivos de src/app (icon.svg, apple-icon.png, favicon.ico, manifest.ts).
    openGraph: { type: "website", siteName: t.name, title: t.name, description: t.description, images: [shareImage] },
    twitter: { card: "summary_large_image", images: [shareImage] },
    appleWebApp: { title: t.name, statusBarStyle: "default" },
  };
}

// El color de la barra del navegador en el celular: el de la barra de la app, en claro y en oscuro.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#161a20" },
  ],
};

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
        {/* Si el layout raíz cambia sin recargar (otro idioma), vuelve a poner el tema elegido. */}
        <ThemeSync />
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        {/* Vercel Web Analytics y Speed Insights: visitas y velocidad de carga, anónimas y sin
            cookies (ver /privacidad). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
