import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Qué versión está corriendo, para /admin/salud (src/lib/build-info.ts). El build de producción
  // corre en GitHub Actions (vercel build), que define GITHUB_SHA; en local queda vacío. Se reemplaza
  // en el código al compilar: no es secreto (el repositorio es público).
  env: {
    APP_COMMIT_SHA: process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    APP_BUILT_AT: new Date().toISOString(),
    // La URL pública, para lo que se arma al compilar (la imagen para compartir de la portada, src/lib/
    // app-url.ts): el job de despliegue del CI la define como PRODUCTION_URL. Sin ella, en el build no hay
    // cómo saberla y quedaría http://localhost:3000.
    APP_PUBLIC_URL: process.env.PRODUCTION_URL ?? "",
  },
  // No anunciar "X-Powered-By: Next.js".
  poweredByHeader: false,
  async headers() {
    const dev = process.env.NODE_ENV === "development";
    return [{ source: "/:path*", headers: securityHeaders({ dev }) }];
  },
  // Rutas viejas que siguen funcionando: las de la administración (de antes de organizarla en módulos), con los
  // parámetros de la URL tal cual, y la de los presupuestos, que pasaron a Configuración.
  async redirects() {
    const historyParams = ["tipo", "q", "fecha", "desde", "hasta", "mostrar"];
    return [
      { source: "/presupuestos", destination: "/configuracion#presupuestos", permanent: false },
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
