// Los módulos de la sección de administración: de aquí salen la subnavegación (src/app/(app)/admin/
// layout.tsx) y las tarjetas de Inicio. Una prueba exige que cada módulo activo tenga su página bajo
// /admin y que no haya páginas de admin sin módulo (src/modules/admin/modules.test.ts).
//
// Agregar un módulo (ver CLAUDE.md): su entrada aquí, su carpeta en src/app/(app)/admin/<id>/ y en
// src/modules/admin/<id>/ (consultas que llaman a requireAdmin), y sus pruebas.

export const ADMIN_MODULE_IDS = [
  "historial",
  "usuarios",
  "bot",
  "categorias",
  "salud",
  "configuracion",
  "seguridad",
] as const;
export type AdminModuleId = (typeof ADMIN_MODULE_IDS)[number];

export type AdminModule = {
  id: AdminModuleId;
  /** Nombre corto: el chip de la subnavegación y el título de la tarjeta. */
  label: string;
  href: `/admin/${string}`;
  /** Qué hay ahí, en una frase (tarjeta de Inicio). */
  description: string;
  /** "pronto": se anuncia en Inicio, sin enlace ni página todavía. */
  status: "activo" | "pronto";
};

export const ADMIN_HOME = { label: "Inicio", href: "/admin" } as const;

// En el orden en que se muestran. Seguridad (la cuenta del admin) va al final.
export const ADMIN_MODULES: readonly AdminModule[] = [
  {
    id: "historial",
    label: "Historial",
    href: "/admin/historial",
    description: "Registro y vinculación de WhatsApp de cada cuenta",
    status: "activo",
  },
  {
    id: "usuarios",
    label: "Usuarios",
    href: "/admin/usuarios",
    description: "Cuentas, sesiones y estado",
    status: "activo",
  },
  {
    id: "bot",
    label: "Bot de WhatsApp",
    href: "/admin/bot",
    description: "Mensajes, errores y consumo de Claude",
    status: "pronto",
  },
  {
    id: "categorias",
    label: "Categorías",
    href: "/admin/categorias",
    description: "Las categorías de ingresos y egresos",
    status: "pronto",
  },
  {
    id: "salud",
    label: "Salud del sistema",
    href: "/admin/salud",
    description: "Base de datos, despliegues y servicios",
    status: "pronto",
  },
  {
    id: "configuracion",
    label: "Configuración",
    href: "/admin/configuracion",
    description: "Ajustes globales de la app",
    status: "pronto",
  },
  {
    id: "seguridad",
    label: "Seguridad",
    href: "/admin/seguridad",
    description: "Tu verificación en dos pasos",
    status: "activo",
  },
];

export const activeAdminModules = () => ADMIN_MODULES.filter((m) => m.status === "activo");

/** Los chips de la subnavegación: Inicio y los módulos activos. */
export const adminNavItems = () => [ADMIN_HOME, ...activeAdminModules()];

/** ¿La página actual es de ese chip? Inicio solo en /admin; un módulo, en toda su ruta. */
export function isCurrentAdminItem(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === ADMIN_HOME.href) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
