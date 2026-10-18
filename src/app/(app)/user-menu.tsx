import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminBadge, AdminShield } from "@/components/admin-badge";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { AccountMenu } from "./account-menu";

async function signOutAction() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

/**
 * El menú de la cuenta del encabezado (src/app/(app)/account-menu.tsx). Lo de admin (la etiqueta y el
 * escudo) lo dibuja aquí el servidor, solo para quien tiene el rol.
 */
export async function UserMenu() {
  const user = await requireUser();
  const admin = hasRole(user.role, "admin");
  return (
    <AccountMenu
      name={user.name}
      email={user.email}
      admin={admin}
      badge={admin ? <AdminBadge /> : null}
      shield={admin ? <AdminShield /> : null}
      signOut={signOutAction}
    />
  );
}
