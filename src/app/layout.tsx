import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Finanzas", template: "%s · Finanzas" },
  description: "Registra tus ingresos y egresos, también desde WhatsApp.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: el script de tema pone data-theme en <html> antes de que React
    // hidrate, así que en el navegador el atributo no coincide con el HTML del servidor (a propósito).
    <html
      lang="es"
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
