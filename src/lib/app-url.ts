/**
 * URL pública de la app: la del inicio de sesión, los enlaces que manda el bot, el sitemap y la imagen
 * para compartir. En orden:
 * - BETTER_AUTH_URL, si está (las E2E; o para forzar otra);
 * - la de producción que fija el build (APP_PUBLIC_URL, de PRODUCTION_URL en el job de despliegue): el
 *   dominio vive en un solo lugar, .github/workflows/ci.yml. Sirve también para lo que se arma al compilar
 *   (la portada), donde Vercel todavía no dice la URL;
 * - la de producción del proyecto en Vercel;
 * - en local, localhost:3000.
 */
export function getAppUrl({ built = process.env.APP_PUBLIC_URL }: { built?: string } = {}): string {
  const url =
    process.env.BETTER_AUTH_URL ||
    built ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    "http://localhost:3000";
  return url.replace(/\/$/, "");
}

/** Dominios de la deployment actual de Vercel (previews), aceptados por la autenticación. */
export function getVercelOrigins(): string[] {
  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);
}
