import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getAppUrl } from "@/lib/app-url";

// Los buscadores pueden indexar la portada, el login, el registro y las páginas legales; nunca
// la parte privada ni la API. No es una medida de seguridad (esas páginas igual exigen sesión):
// solo evita que los buscadores intenten entrar y terminen indexando la página de login.
// src/app/robots.test.ts exige que toda página de la parte privada (src/app/[lang]/(app)) esté aquí.
export const PRIVATE_PATHS = [
  "/dashboard",
  "/ingresos",
  "/egresos",
  "/gastos-fijos",
  "/reportes",
  "/presupuestos",
  "/movimientos/",
  "/cuenta",
  "/ayuda",
  "/admin",
  "/simulador",
  "/api/",
];

// Cada regla vale para todo lo que empieza igual: "/cuenta" también taparía /cuenta-eliminada, que es
// pública. Gana la regla más larga (RFC 9309), así que esta la deja ver.
export const PUBLIC_EXCEPTIONS = ["/cuenta-eliminada"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  // En cada pedido, como el sitemap (src/app/sitemap.ts): al compilar no está la URL de producción.
  await connection();
  return {
    rules: { userAgent: "*", allow: ["/", ...PUBLIC_EXCEPTIONS], disallow: PRIVATE_PATHS },
    // Las páginas públicas están en src/app/sitemap.ts.
    sitemap: `${getAppUrl()}/sitemap.xml`,
  };
}
