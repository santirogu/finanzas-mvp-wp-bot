import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./auth";
import { EXPIRED_SESSION_LOGIN } from "./expired-session";
import { hasCurrentConsent, PRIVACY_CONSENT_PATH } from "./privacy";
import { hasRole, isSuperAdmin, parseRole, type Role, TWO_FACTOR_SETUP_PATH } from "./roles";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  role: Role;
  /** La marca de super admin (vale solo con el rol de admin: ver isSuperAdmin en src/lib/roles.ts). */
  superAdmin: boolean;
  /** Verificación en dos pasos activa (Google Authenticator). Obligatoria para administrar. */
  twoFactorEnabled: boolean;
  /** La versión de la política de privacidad que autorizó (src/lib/privacy.ts); null si ninguna. */
  privacyVersion: string | null;
};

export { TWO_FACTOR_SETUP_PATH };

// Data Access Layer: único punto donde se lee la sesión. Todo acceso a datos
// del usuario debe pasar por aquí para no confiar en lo que envía el cliente.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  // Al suspenderla se cierran sus sesiones; si quedara alguna (dos pedidos a la vez), no sirve.
  if (session.user.suspendedAt) return null;
  const { id, name, email, timezone, role, superAdmin, twoFactorEnabled, privacyVersion } = session.user;
  return {
    id,
    name,
    email,
    timezone: timezone ?? "America/Bogota",
    // Sale de la base en cada request (no hay caché de sesión en la cookie): quitar el rol a
    // alguien surte efecto en su siguiente clic.
    role: parseRole(role),
    superAdmin: superAdmin === true,
    twoFactorEnabled: twoFactorEnabled === true,
    privacyVersion: typeof privacyVersion === "string" ? privacyVersion : null,
  };
});

/**
 * Para todo lo de la cuenta (páginas, acciones y rutas): la sesión y la autorización vigente de los datos. Sin
 * sesión lleva al login; sin la autorización, a darla (src/lib/privacy.ts): nada de la app usa sus datos antes.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await requireSignedIn();
  if (!hasCurrentConsent(user.privacyVersion)) redirect(PRIVACY_CONSENT_PATH);
  return user;
}

/**
 * La sesión sin exigir la autorización de los datos. Solo para darla (/autorizacion) y para eliminar la cuenta: quien
 * no la da puede irse con sus datos borrados. Todo lo demás usa requireUser.
 */
export async function requireSignedIn(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // Sin sesión válida aquí, el navegador trae una cookie vieja (sin cookie, el proxy ya habría
  // mandado al login): ver src/lib/expired-session.ts.
  if (!user) redirect(EXPIRED_SESSION_LOGIN);
  return user;
}

/**
 * Para todo lo de administración (páginas, acciones y consultas). Sin sesión lleva al login; con
 * sesión pero sin rol de admin responde 404, para no revelar que la sección existe; un admin sin la
 * verificación en dos pasos va a configurarla.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireAdminRole();
  if (!user.twoFactorEnabled) redirect(TWO_FACTOR_SETUP_PATH);
  return user;
}

/**
 * ¿Puede administrar? El rol de admin y la verificación en dos pasos, lo mismo que pide requireAdmin, pero sin
 * redirigir: para mostrar algo de administración fuera de /admin (las alertas del bot en la campana).
 */
export const canAdminister = (user: CurrentUser) => hasRole(user.role, "admin") && user.twoFactorEnabled;

/**
 * Para dar y quitar el rol de admin (/admin/usuarios): lo de requireAdmin y, además, ser el super
 * admin. A cualquier otro admin le responde 404, como a quien no es admin.
 */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireAdmin();
  if (!isSuperAdmin(user.role, user.superAdmin)) notFound();
  return user;
}

/**
 * El rol de admin sin exigir la verificación en dos pasos. Solo para la página donde se configura
 * (TWO_FACTOR_SETUP_PATH); todo lo demás usa requireAdmin.
 */
export async function requireAdminRole(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user.role, "admin")) notFound();
  return user;
}
