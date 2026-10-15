import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./auth";
import { EXPIRED_SESSION_LOGIN } from "./expired-session";
import { hasRole, parseRole, type Role } from "./roles";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  currency: string;
  role: Role;
  /** Verificación en dos pasos activa (Google Authenticator). Obligatoria para administrar. */
  twoFactorEnabled: boolean;
};

/** Donde un admin configura la verificación en dos pasos. */
export const TWO_FACTOR_SETUP_PATH = "/admin/seguridad";

// Data Access Layer: único punto donde se lee la sesión. Todo acceso a datos
// del usuario debe pasar por aquí para no confiar en lo que envía el cliente.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, timezone, currency, role, twoFactorEnabled } = session.user;
  return {
    id,
    name,
    email,
    timezone: timezone ?? "America/Bogota",
    currency: currency ?? "COP",
    // Sale de la base en cada request (no hay caché de sesión en la cookie): quitar el rol a
    // alguien surte efecto en su siguiente clic.
    role: parseRole(role),
    twoFactorEnabled: twoFactorEnabled === true,
  };
});

export async function requireUser(): Promise<CurrentUser> {
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
 * El rol de admin sin exigir la verificación en dos pasos. Solo para la página donde se configura
 * (TWO_FACTOR_SETUP_PATH); todo lo demás usa requireAdmin.
 */
export async function requireAdminRole(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user.role, "admin")) notFound();
  return user;
}
