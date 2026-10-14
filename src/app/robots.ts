import type { MetadataRoute } from "next";

// Los buscadores pueden indexar la portada, el login, el registro y las páginas legales; nunca
// la parte privada ni la API. No es una medida de seguridad (esas páginas igual exigen sesión):
// solo evita que los buscadores intenten entrar y terminen indexando la página de login.
export const PRIVATE_PATHS = ["/dashboard", "/ingresos", "/egresos", "/simulador", "/api/"];

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS } };
}
