import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getAppUrl } from "@/lib/app-url";

// Las páginas que un buscador puede mostrar: las que se ven sin sesión. /cuenta-eliminada también es
// pública, pero solo tiene sentido justo después de borrar la cuenta. Sin fecha de cambio
// (lastModified): una fecha que no es real hace que los buscadores dejen de creerla.
export const SITEMAP_PATHS = ["/", "/registro", "/login", "/ayuda", "/privacidad", "/eliminar-datos"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // La URL de la app se lee en cada pedido: al compilar (en el CI, con `vercel build`) Vercel todavía
  // no da la de producción, y el sitemap quedaba con http://localhost:3000.
  await connection();
  const appUrl = getAppUrl();
  return SITEMAP_PATHS.map((path) => ({ url: path === "/" ? appUrl : `${appUrl}${path}` }));
}
