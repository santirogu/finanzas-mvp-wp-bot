import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { db, schema } from "@/db";
import { clearFailures, lockedUntil, normalizeEmail, recordFailure } from "@/modules/auth/lockout";
import {
  TWO_FACTOR_DISABLED_PATHS,
  TWO_FACTOR_ERRORS,
  TWO_FACTOR_ISSUER,
  TWO_FACTOR_LOCKOUT,
  twoFactorViolation,
} from "@/modules/auth/two-factor-rules";
import { getAppUrl, getVercelOrigins } from "./app-url";
import { envVar } from "./env";
import { ROLES, hasRole, parseRole } from "./roles";

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
      rateLimit: schema.rateLimit,
      twoFactor: schema.twoFactor,
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
      // input: false → el registro ignora el rol que mande el cliente (queda "user") y
      // "actualizar perfil" lo rechaza. Solo se cambia desde la terminal (pnpm admin:grant).
      role: { type: [...ROLES], required: false, defaultValue: "user", input: false },
    },
  },
  // Límite de intentos por IP (contra quien prueba contraseñas a la fuerza), guardado en Postgres.
  // En memoria (lo que hace Better Auth por defecto) no sirve en Vercel: cada instancia tiene su
  // propio contador y se reinicia seguido. Reglas de Better Auth: 3 intentos cada 10 s en login y
  // registro, y 100 pedidos cada 10 s en el resto. Activo también fuera de producción, para
  // probarlo. La IP sale de x-forwarded-for, que Vercel reemplaza con la IP real del cliente.
  rateLimit: { enabled: true, storage: "database" },
  // Bloqueo por cuenta tras varios intentos fallidos, venga de la IP que venga
  // (src/modules/auth/lockout.ts). Se trata igual un correo que no existe: no revela cuáles hay.
  // Cuenta tanto el login como la contraseña que pide activar la verificación en dos pasos.
  // Además, las reglas propias de la verificación en dos pasos (src/modules/auth/two-factor-rules.ts).
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        await assertNotLocked(normalizeEmail(ctx.body?.email));
        return;
      }
      if (!ctx.path.startsWith("/two-factor/")) return;
      const session = ctx.path === "/two-factor/enable" ? await getSessionFromCtx(ctx) : null;
      const violation = twoFactorViolation({
        path: ctx.path,
        body: ctx.body,
        isAdmin: session ? hasRole(parseRole(session.user.role), "admin") : null,
      });
      if (violation === "ADMIN_ONLY") throw APIError.from("FORBIDDEN", TWO_FACTOR_ERRORS.ADMIN_ONLY);
      if (violation) throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERRORS[violation]);
      if (session) await assertNotLocked(normalizeEmail(session.user.email));
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      if (ctx.path === "/sign-in/email") {
        const email = normalizeEmail(ctx.body?.email);
        if (!email) return;
        if (!isAPIError(returned)) await clearFailures(email);
        else if (returned.body?.code === "INVALID_EMAIL_OR_PASSWORD") await recordFailure(email);
        return;
      }
      if (ctx.path === "/two-factor/enable" && isAPIError(returned) && returned.body?.code === "INVALID_PASSWORD") {
        const session = await getSessionFromCtx(ctx);
        if (session) await recordFailure(normalizeEmail(session.user.email));
      }
    }),
  },
  // Rutas apagadas (responden 404); ver TWO_FACTOR_DISABLED_PATHS.
  disabledPaths: [...TWO_FACTOR_DISABLED_PATHS],
  session: {
    // Sesión en cookie httpOnly, válida 30 días y renovada cada 24 h de uso.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    // Verificación en dos pasos con una app TOTP (Google Authenticator). Sin "recordar este
    // dispositivo": el código se pide en cada inicio de sesión. Tras 5 códigos incorrectos seguidos
    // se bloquea 15 minutos (además del límite de 3 intentos cada 10 s por IP del plugin).
    twoFactor({
      issuer: TWO_FACTOR_ISSUER,
      accountLockout: { enabled: true, ...TWO_FACTOR_LOCKOUT },
    }),
    // nextCookies debe ir de último: permite que las Server Actions escriban la cookie de sesión.
    nextCookies(),
  ],
});

/** Error del login bloqueado por intentos fallidos, con los minutos que faltan. */
async function assertNotLocked(email: string) {
  const until = email ? await lockedUntil(email) : null;
  if (!until) return;
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  throw APIError.from("TOO_MANY_REQUESTS", {
    code: "ACCOUNT_LOCKED",
    message: `Por seguridad, la cuenta quedó bloqueada por varios intentos fallidos. Intenta de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`,
  });
}

export type Session = typeof auth.$Infer.Session;
