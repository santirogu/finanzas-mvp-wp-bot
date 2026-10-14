/**
 * URL pública de la app. En Vercel se detecta sola con las variables de sistema;
 * BETTER_AUTH_URL tiene prioridad (útil con un dominio propio).
 */
export function getAppUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

/** Dominios de la deployment actual de Vercel (previews), aceptados por la autenticación. */
export function getVercelOrigins(): string[] {
  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);
}
