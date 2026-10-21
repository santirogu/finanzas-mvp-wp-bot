import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@/lib/brand";

// Para agregar la app a la pantalla de inicio del celular (Android; el iPhone usa apple-icon.png). Los
// íconos los genera scripts/brand-assets.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: "Escribe tu gasto por WhatsApp y queda anotado.",
    lang: "es",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0f766e",
    icons: [
      { src: "/marca/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/marca/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/marca/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
