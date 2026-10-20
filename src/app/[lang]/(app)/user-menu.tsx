import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminBadge, AdminShield } from "@/components/admin-badge";
import { auth } from "@/lib/auth";
import { hasRole, isSuperAdmin } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { AccountMenu } from "./account-menu";

async function signOutAction() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

/**
 * El menú de la cuenta del encabezado (src/app/[lang]/(app)/account-menu.tsx). Lo de admin (la etiqueta y el
 * escudo, dorados para el super admin) lo dibuja aquí el servidor, solo para quien tiene el rol.
 */
export async function UserMenu() {
  const user = await requireUser();
  const admin = hasRole(user.role, "admin");
  // El super admin, en dorado; los demás admins, en violeta.
  const superAdmin = isSuperAdmin(user.role, user.superAdmin);
  return (
    <AccountMenu
      name={user.name}
      email={user.email}
      roleName={superAdmin ? "super admin" : admin ? "admin" : undefined}
      badge={admin ? <AdminBadge superAdmin={superAdmin} /> : null}
      shield={admin ? <AdminShield superAdmin={superAdmin} /> : null}
      signOut={signOutAction}
    />
  );
}
