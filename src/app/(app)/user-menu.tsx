import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminBadge } from "@/components/admin-badge";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { requireUser } from "@/lib/session";

async function signOutAction() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function UserMenu() {
  const user = await requireUser();
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted sm:inline">{user.name}</span>
      {/* Visible también en celular (donde el nombre no cabe): siempre se sabe con qué cuenta se está. */}
      {hasRole(user.role, "admin") && <AdminBadge />}
      <Link href="/cuenta" className="font-medium text-muted hover:text-foreground">
        Mi cuenta
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-background"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
