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
