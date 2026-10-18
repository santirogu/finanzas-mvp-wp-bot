import { ShieldIcon } from "./shield-icon";

/**
 * Etiqueta "Admin" del menú de la cuenta, junto al nombre y al correo. La dibuja el servidor solo para
 * quien tiene el rol (src/app/(app)/user-menu.tsx): a los demás ni siquiera les llega en el HTML.
 */
export function AdminBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-admin-border bg-admin-surface px-2 py-0.5 text-xs font-medium text-admin">
      <ShieldIcon className="size-3.5" />
      Admin
    </span>
  );
}

/**
 * El escudo morado sobre el círculo de la cuenta: con el menú cerrado (y en celular) se ve siempre con
 * qué rol se está. Decorativo: el botón ya dice "admin" en su nombre. También lo dibuja solo el servidor.
 */
export function AdminShield() {
  return (
    <span
      aria-hidden
      data-admin-shield
      className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-admin-border bg-admin-surface text-admin"
    >
      <ShieldIcon className="size-3" />
    </span>
  );
}
