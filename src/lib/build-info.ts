import { envVar } from "./env";

// Qué versión de la app está corriendo y dónde, para /admin/salud. El commit y la fecha del build los
// fija next.config.ts al compilar (`env`): se leen como `process.env.APP_…` literal, que es lo que Next
// reemplaza. El entorno y la región los pone Vercel en cada función.

export type BuildInfo = {
  /** El commit compilado (40 caracteres), o null en un build local. */
  commit: string | null;
  builtAt: Date | null;
  /** "production", "preview" o "development". */
  environment: string;
  /** La región de Vercel que atiende ("iad1"), o null fuera de Vercel. */
  region: string | null;
  node: string;
};

export function buildInfo({
  commit = process.env.APP_COMMIT_SHA,
  builtAt = process.env.APP_BUILT_AT,
  env = envVar,
}: { commit?: string; builtAt?: string; env?: (name: string) => string | undefined } = {}): BuildInfo {
  const date = builtAt ? new Date(builtAt) : null;
  return {
    commit: commit || null,
    builtAt: date && !Number.isNaN(date.getTime()) ? date : null,
    environment: env("VERCEL_ENV") ?? (process.env.NODE_ENV === "production" ? "production" : "development"),
    region: env("VERCEL_REGION") ?? null,
    node: process.version,
  };
}
