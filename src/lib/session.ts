import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  currency: string;
};

// Data Access Layer: único punto donde se lee la sesión. Todo acceso a datos
// del usuario debe pasar por aquí para no confiar en lo que envía el cliente.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, timezone, currency } = session.user;
  return {
    id,
    name,
    email,
    timezone: timezone ?? "America/Bogota",
    currency: currency ?? "COP",
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
