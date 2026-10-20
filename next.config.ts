import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // No anunciar "X-Powered-By: Next.js".
  poweredByHeader: false,
  async headers() {
    const dev = process.env.NODE_ENV === "development";
    return [{ source: "/:path*", headers: securityHeaders({ dev }) }];
  },
  // Rutas viejas de la administración (de antes de organizarla en módulos): siguen funcionando.
  // Los parámetros de la URL pasan tal cual a la ruta nueva.
  async redirects() {
    const historyParams = ["tipo", "q", "fecha", "desde", "hasta", "mostrar"];
    return [
      { source: "/admin/verificacion", destination: "/admin/seguridad", permanent: true },
      ...historyParams.map((key) => ({
        source: "/admin",
        has: [{ type: "query" as const, key }],
        destination: "/admin/historial",
        permanent: true,
      })),
    ];
  },
  partialPrefetching: true,
  experimental: {
    // La 404 de lo que no es una página (una ruta de la API que no existe): src/app/global-not-found.tsx.
    // Las páginas están en src/app/[lang]/ (el layout raíz depende del idioma), así que no hay un layout
    // común con el que armarla.
    globalNotFound: true,
  },
  // La fuente del "Reporte (PDF)" se lee del disco (src/modules/reports/pdf/render.tsx): sin esto, no
  // viaja con la función de la ruta en Vercel.
  outputFileTracingIncludes: {
    "/[lang]/reportes/pdf": ["./src/modules/reports/pdf/fonts/*.ttf"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
