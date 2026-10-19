import { ShieldIcon } from "./shield-icon";

// Los admins van en violeta (admin) y el super admin, en dorado (superadmin): globals.css. Escritas
// completas, porque Tailwind solo genera las clases que encuentra así en el código.
const COLORS = {
  admin: "border-admin-border bg-admin-surface text-admin",
  super: "border-superadmin-border bg-superadmin-surface text-superadmin",
};

/**
 * Etiqueta "Admin" (o "Super admin", en dorado) del menú de la cuenta, junto al nombre y al correo, y
 * de las cuentas en Usuarios. La dibuja el servidor solo para quien tiene el rol
 * (src/app/(app)/user-menu.tsx): a los demás ni siquiera les llega en el HTML.
 */
export function AdminBadge({ superAdmin = false }: { superAdmin?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${superAdmin ? COLORS.super : COLORS.admin}`}
    >
      <ShieldIcon className="size-3.5" />
      {superAdmin ? "Super admin" : "Admin"}
    </span>
  );
}

/**
 * El escudo sobre el círculo de la cuenta (morado; dorado el del super admin): con el menú cerrado (y
 * en celular) se ve siempre con qué rol se está. Decorativo: el botón ya dice "admin" en su nombre.
 * También lo dibuja solo el servidor.
 */
export function AdminShield({ superAdmin = false }: { superAdmin?: boolean }) {
  return (
    <span
      aria-hidden
      data-admin-shield
      className={`absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border ${superAdmin ? COLORS.super : COLORS.admin}`}
    >
      <ShieldIcon className="size-3" />
    </span>
  );
}
