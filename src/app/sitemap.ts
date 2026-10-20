import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/app-url";

// Las páginas que un buscador puede mostrar: las que se ven sin sesión. /cuenta-eliminada también es
// pública, pero solo tiene sentido justo después de borrar la cuenta. Sin fecha de cambio
// (lastModified): una fecha que no es real hace que los buscadores dejen de creerla.
export const SITEMAP_PATHS = ["/", "/registro", "/login", "/privacidad", "/eliminar-datos"];

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = getAppUrl();
  return SITEMAP_PATHS.map((path) => ({ url: path === "/" ? appUrl : `${appUrl}${path}` }));
}
