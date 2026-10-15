import { AdminBadge } from "@/components/admin-badge";
import { hasRole, type Role } from "@/lib/roles";
import { formatHour } from "@/modules/admin/shared/filters";

/** Junto al nombre de una cuenta en Usuarios: si es admin y si tiene el inicio de sesión bloqueado. */
export function AccountBadges({ role, lockedUntil }: { role: Role; lockedUntil: Date | null }) {
  return (
    <>
      {hasRole(role, "admin") && <AdminBadge />}
      {lockedUntil && (
        <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
          Bloqueada hasta las {formatHour(lockedUntil)}
        </span>
      )}
    </>
  );
}

/** La inicial del nombre en un círculo (decorativa: el nombre va al lado). */
export function Initial({ name, size = "size-9" }: { name: string; size?: string }) {
  return (
    <span
      aria-hidden
      className={`flex ${size} flex-none items-center justify-center rounded-full bg-admin-surface text-sm font-semibold text-admin`}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
