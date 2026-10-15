import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./auth";
import { hasRole, parseRole, type Role } from "./roles";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  currency: string;
  role: Role;
};

// Data Access Layer: único punto donde se lee la sesión. Todo acceso a datos
// del usuario debe pasar por aquí para no confiar en lo que envía el cliente.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, timezone, currency, role } = session.user;
  return {
    id,
    name,
    email,
    timezone: timezone ?? "America/Bogota",
    currency: currency ?? "COP",
    // Sale de la base en cada request (no hay caché de sesión en la cookie): quitar el rol a
    // alguien surte efecto en su siguiente clic.
    role: parseRole(role),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Para todo lo de administración (páginas, acciones y consultas). Sin sesión lleva al login; con
 * sesión pero sin rol de admin responde 404, para no revelar que la sección existe.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user.role, "admin")) notFound();
  return user;
}
