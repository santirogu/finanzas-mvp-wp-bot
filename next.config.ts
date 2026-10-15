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
