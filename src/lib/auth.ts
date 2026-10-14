import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";

export const auth = betterAuth({
  appName: "Finanzas MVP",
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
