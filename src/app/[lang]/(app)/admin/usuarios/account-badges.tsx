import { AdminBadge } from "@/components/admin-badge";
import { hasRole, isSuperAdmin, type Role } from "@/lib/roles";
import { formatHour } from "@/modules/admin/shared/filters";

/** Junto al nombre de una cuenta en Usuarios: si es admin (o el super admin), si está suspendida y si tiene el inicio de sesión bloqueado. */
export function AccountBadges({
  role,
  superAdmin = false,
  lockedUntil,
  suspended,
}: {
  role: Role;
  /** La marca de super admin: su etiqueta va en dorado. */
  superAdmin?: boolean;
  lockedUntil: Date | null;
  suspended: boolean;
}) {
  return (
    <>
      {hasRole(role, "admin") && <AdminBadge superAdmin={isSuperAdmin(role, superAdmin)} />}
      {suspended && (
        <span className="rounded-full border border-foreground/30 bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground">
          Suspendida
        </span>
      )}
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
