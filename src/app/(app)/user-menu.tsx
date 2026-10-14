import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
