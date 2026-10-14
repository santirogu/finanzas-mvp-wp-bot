import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { db, schema } from "@/db";
import { getAppUrl, getVercelOrigins } from "./app-url";
import { envVar } from "./env";

// El build corre en GitHub Actions, que no recibe los secretos de Vercel. Better Auth exige
// un secreto al inicializarse, así que durante el build se usa uno provisional que nunca
// firma sesiones: en ejecución se usa el real y, si falta, Better Auth falla como debe.
const secret =
  envVar("BETTER_AUTH_SECRET") ??
  (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ? "build-time-placeholder-not-used-at-runtime"
    : undefined);

export const auth = betterAuth({
  appName: "Finanzas MVP",
  secret,
  baseURL: getAppUrl(),
  // En Vercel, acepta también la URL propia de cada deployment (previews).
  trustedOrigins: getVercelOrigins(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      timezone: { type: "string", required: false, defaultValue: "America/Bogota", input: false },
      currency: { type: "string", required: false, defaultValue: "COP", input: false },
    },
  },
  session: {
    // Sesión en cookie httpOnly, válida 30 días y renovada cada 24 h de uso.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  // nextCookies debe ir de último: permite que las Server Actions escriban la cookie de sesión.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
