// Tablas requeridas por Better Auth (user, session, account, verification, rateLimit) y su plugin
// de verificación en dos pasos (twoFactor).
// Si cambias la configuración de Better Auth, revisa que estos campos sigan coincidiendo.
import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { ROLES } from "../../lib/roles";

// Rol de cada cuenta (src/lib/roles.ts). La base solo acepta estos valores.
export const userRole = pgEnum("user_role", ROLES);

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    timezone: text("timezone").notNull().default("America/Bogota"),
    currency: text("currency").notNull().default("COP"),
    // Toda cuenta nace como "user". "admin" lo da el super admin desde /admin/usuarios (con su código)
    // o la terminal (pnpm admin:grant).
    role: userRole("role").notNull().default("user"),
    // El super admin: un admin que además puede dar y quitar el rol de admin desde la app. Uno solo
    // (índice único abajo) y solo desde la terminal (pnpm admin:super): nunca desde la app.
    superAdmin: boolean("super_admin").notNull().default(false),
    // Verificación en dos pasos (plugin twoFactor): se activa al confirmar el primer código de
    // Google Authenticator. Obligatoria para entrar a la sección de administración.
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    // Suspendida por el admin (/admin/usuarios): no puede entrar a la web ni usar el bot hasta que la
    // reactive (src/modules/account/suspension.ts). El motivo es interno: solo lo ve el admin.
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspensionReason: text("suspension_reason"),
    // El idioma que eligió en Mi cuenta ("es" o "en"); null si no eligió: ve la app en el idioma de su
    // navegador. Al iniciar sesión en otro navegador, se le pone ahí también (src/lib/auth.ts).
    locale: text("locale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // A lo sumo un super admin: la base rechaza marcar un segundo.
    uniqueIndex("user_one_super_admin_idx").on(t.superAdmin).where(sql`${t.superAdmin}`),
    // Solo los idiomas de la app (src/i18n/locales.ts).
    check("user_locale_check", sql`${t.locale} in ('es', 'en')`),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// Límite de intentos de Better Auth (rateLimit.storage = "database"): una fila por IP y ruta, con
// cuántos pedidos van en la ventana actual. Better Auth borra sola las filas vencidas.
export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    // Milisegundos desde 1970 (Date.now()), como los guarda Better Auth.
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (t) => [index("rate_limit_last_request_idx").on(t.lastRequest)],
);

// Intentos fallidos de login por cuenta (no es de Better Auth; ver src/modules/auth/lockout.ts).
// Va por correo y no por usuario: así se trata igual un correo que no existe y no se revela
// cuáles están registrados.
export const loginFailure = pgTable("login_failure", {
  email: text("email").primaryKey(), // en minúsculas
  failures: integer("failures").notNull(),
  firstFailureAt: timestamp("first_failure_at", { withTimezone: true }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

// Verificación en dos pasos (plugin twoFactor de Better Auth): una fila por cuenta que la configuró.
// Better Auth guarda la clave secreta y los códigos de respaldo cifrados con BETTER_AUTH_SECRET.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // false mientras no se confirma el primer código (configuración a medias).
    verified: boolean("verified").notNull().default(true),
    // Intentos fallidos seguidos y bloqueo temporal (accountLockout del plugin).
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factor_user_id_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);
