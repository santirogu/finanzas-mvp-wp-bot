// Roles de la app. Sin dependencias: lo usan el esquema de la base, el servidor y los comandos
// de terminal.
//
//   user  → toda cuenta al registrarse: Resumen, Ingresos, Egresos, Reportes y Mi cuenta.
//   admin → todo lo de "user" y además la sección de administración. Lo da el super admin desde
//           /admin/usuarios (con su código de Google Authenticator) o la terminal (pnpm admin:grant).
//
// El super admin no es otro rol: es un admin con la marca super_admin (una sola cuenta, puesta solo
// desde la terminal con pnpm admin:super). Además de lo de admin, da y quita el rol de admin.

import type { Locale } from "@/i18n/locales";

export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Nombre de cada rol para mostrar en la app. */
export const ROLE_LABELS: Record<Role, string> = {
  user: "Usuario",
  admin: "Administrador",
};

/** Lo que incluye cada rol: un admin también es usuario. */
const INCLUDES: Record<Role, readonly Role[]> = {
  user: ["user"],
  admin: ["admin", "user"],
};

/** Convierte lo que venga de la sesión o de la base en un rol. Ante cualquier duda: "user". */
export function parseRole(value: unknown): Role {
  return value === "admin" ? "admin" : "user";
}

/** ¿Quien tiene `role` puede hacer lo que exige `required`? */
export function hasRole(role: Role, required: Role): boolean {
  return INCLUDES[role].includes(required);
}

/**
 * ¿Es el super admin? La marca sola no alcanza: también tiene que ser admin (si se le quitó el rol
 * desde la terminal, la marca no le deja nada).
 */
export function isSuperAdmin(role: Role, superAdmin: boolean): boolean {
  return superAdmin && hasRole(role, "admin");
}

/** Los nombres de los roles en inglés. */
const ROLE_LABELS_EN: Record<Role, string> = { user: "User", admin: "Administrator" };

/** El rol para mostrar: "Superadministrador" para el super admin (en inglés, "Super administrator"). */
export function roleLabel(role: Role, superAdmin: boolean, locale: Locale = "es"): string {
  if (isSuperAdmin(role, superAdmin)) return locale === "es" ? "Superadministrador" : "Super administrator";
  return (locale === "es" ? ROLE_LABELS : ROLE_LABELS_EN)[role];
}

/** Donde un admin configura la verificación en dos pasos (/admin/seguridad). */
export const TWO_FACTOR_SETUP_PATH = "/admin/seguridad";

/**
 * Adónde va alguien al terminar de iniciar sesión: un admin sin la verificación en dos pasos, a
 * configurarla (es lo primero que ve un admin nuevo); los demás, a su Resumen. La sesión llega del
 * navegador (la respuesta del login), así que el rol se vuelve a leer con parseRole: ante la duda,
 * "user". Solo decide adónde ir; lo que protege la administración es requireAdmin().
 */
export function afterLoginPath(user: { role?: unknown; twoFactorEnabled?: unknown } | null | undefined): string {
  if (!user) return "/dashboard";
  return hasRole(parseRole(user.role), "admin") && user.twoFactorEnabled !== true ? TWO_FACTOR_SETUP_PATH : "/dashboard";
}
