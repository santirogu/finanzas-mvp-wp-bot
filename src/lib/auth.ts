import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { db, schema } from "@/db";
import { recordEvent } from "@/modules/account/events";
import { SUSPENDED_MESSAGE, isSuspended } from "@/modules/account/suspension";
import { parseAccountName } from "@/modules/auth/account-name";
import { AUTH_DISABLED_PATHS } from "@/modules/auth/http-routes";
import { clearFailures, normalizeEmail, releaseAttempt, reserveAttempt } from "@/modules/auth/lockout";
import {
  TWO_FACTOR_ERRORS,
  TWO_FACTOR_ISSUER,
  TWO_FACTOR_LOCKOUT,
  needsSession,
  twoFactorViolation,
} from "@/modules/auth/two-factor-rules";
import { getAppUrl, getVercelOrigins } from "./app-url";
import { envVar } from "./env";
import { ROLES, hasRole, parseRole } from "./roles";
import { describeError, logAuthSafely } from "./safe-log";

// Better Auth exige un secreto al inicializarse. El build de producción trae el real (el job de
// despliegue hace `vercel pull`); si un build corre sin él (por ejemplo, el de las E2E en el CI), se
// usa uno provisional que nunca firma sesiones. En ejecución, si falta, Better Auth falla como debe.
const secret =
  envVar("BETTER_AUTH_SECRET") ??
  (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ? "build-time-placeholder-not-used-at-runtime"
    : undefined);

export const auth = betterAuth({
  appName: "Finanzas MVP",
  // Sin datos personales en los logs: el logger por defecto imprime los errores con los parámetros
  // de la consulta (correo, nombre, hash de la contraseña).
  logger: { log: logAuthSafely },
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
    // El de Better Auth por defecto, explícito: el formulario usa el mismo (maxLength).
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      timezone: { type: "string", required: false, defaultValue: "America/Bogota", input: false },
      currency: { type: "string", required: false, defaultValue: "COP", input: false },
      // input: false → el registro ignora el rol que mande el cliente (queda "user") y
      // "actualizar perfil" lo rechaza. Solo se cambia desde la terminal (pnpm admin:grant).
      role: { type: [...ROLES], required: false, defaultValue: "user", input: false },
      // Suspendida por el admin: input: false → nadie la cambia con "actualizar perfil".
      suspendedAt: { type: "date", required: false, input: false },
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
        await reserveOrThrow(normalizeEmail(ctx.body?.email));
        return;
      }
      // Better Auth no valida el nombre: se limpia y se limita aquí (src/modules/auth/account-name.ts).
      if (ctx.path === "/sign-up/email") {
        const name = parseAccountName(ctx.body?.name);
        if (!name.ok) throw APIError.from("BAD_REQUEST", { code: "INVALID_NAME", message: name.error });
        return { context: { body: { ...ctx.body, name: name.value } } };
      }
      if (!ctx.path.startsWith("/two-factor/")) return;
      const session = needsSession(ctx.path) ? await getSessionFromCtx(ctx) : null;
      const violation = twoFactorViolation({
        path: ctx.path,
        body: ctx.body,
        session: session && {
          isAdmin: hasRole(parseRole(session.user.role), "admin"),
          twoFactorEnabled: session.user.twoFactorEnabled === true,
        },
      });
      if (violation === "ADMIN_ONLY" || violation === "ALREADY_VERIFIED") {
        throw APIError.from("FORBIDDEN", TWO_FACTOR_ERRORS[violation]);
      }
      if (violation) throw APIError.from("BAD_REQUEST", TWO_FACTOR_ERRORS[violation]);
      // La contraseña que pide activarla cuenta para el bloqueo de la cuenta.
      if (session && ctx.path === "/two-factor/enable") await reserveOrThrow(normalizeEmail(session.user.email));
    }),
    // El intento se reservó antes de verificar la contraseña (reserveAttempt): si era la correcta, el
    // contador se borra; si era equivocada, queda como fallo; si fue otra cosa, se devuelve.
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      if (ctx.path === "/sign-in/email") {
        const email = normalizeEmail(ctx.body?.email);
        if (!email) return;
        if (!isAPIError(returned)) await clearFailures(email);
        else if (returned.body?.code !== "INVALID_EMAIL_OR_PASSWORD") await releaseAttempt(email);
        return;
      }
      if (ctx.path === "/two-factor/enable") {
        const session = await getSessionFromCtx(ctx);
        const wrongPassword = isAPIError(returned) && returned.body?.code === "INVALID_PASSWORD";
        if (session && !wrongPassword) await releaseAttempt(normalizeEmail(session.user.email));
      }
    }),
  },
  // Historial de la cuenta (src/modules/account/events.ts). Si no se puede guardar el evento, el
  // registro sigue: perder una línea del historial es mejor que impedir crear la cuenta.
  databaseHooks: {
    // Una cuenta suspendida no puede abrir sesiones (después de la contraseña correcta: a quien no
    // la sabe no se le revela que la cuenta existe ni que está suspendida).
    session: {
      create: {
        before: async (newSession) => {
          if (await isSuspended(newSession.userId)) {
            throw APIError.from("FORBIDDEN", { code: "ACCOUNT_SUSPENDED", message: SUSPENDED_MESSAGE });
          }
        },
      },
    },
    user: {
      create: {
        after: async (created) => {
          try {
            await recordEvent({ type: "registered", userId: created.id });
          } catch (error) {
            console.error("[historial] no se pudo registrar el evento de registro", created.id, describeError(error));
          }
        },
      },
    },
  },
  // Rutas que la app no usa por HTTP: responden 404 (src/modules/auth/http-routes.ts). El route
  // handler de /api/auth además solo deja pasar las de AUTH_HTTP_ROUTES.
  disabledPaths: [...AUTH_DISABLED_PATHS],
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
/** Reserva el intento de contraseña o responde que la cuenta está bloqueada (con los minutos que faltan). */
async function reserveOrThrow(email: string) {
  if (!email) return;
  const reservation = await reserveAttempt(email);
  if (reservation.ok) return;
  const minutes = Math.max(1, Math.ceil((reservation.lockedUntil.getTime() - Date.now()) / 60_000));
  throw APIError.from("TOO_MANY_REQUESTS", {
    code: "ACCOUNT_LOCKED",
    message: `Por seguridad, la cuenta quedó bloqueada por varios intentos fallidos. Intenta de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`,
  });
}

export type Session = typeof auth.$Infer.Session;
