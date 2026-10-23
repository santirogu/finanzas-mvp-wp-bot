// Los módulos de la sección de administración: de aquí salen la subnavegación (src/app/[lang]/(app)/admin/
// layout.tsx) y las tarjetas de Inicio. Una prueba exige que cada módulo activo tenga su página bajo
// /admin y que no haya páginas de admin sin módulo (src/modules/admin/modules.test.ts).
//
// Agregar un módulo (ver CLAUDE.md): su entrada aquí, su carpeta en src/app/[lang]/(app)/admin/<id>/ y en
// src/modules/admin/<id>/ (consultas que llaman a requireAdmin), y sus pruebas.

import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

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
    status: "activo",
  },
  {
    id: "categorias",
    label: "Categorías",
    href: "/admin/categorias",
    description: "Las categorías de ingresos y egresos",
    status: "activo",
  },
  {
    id: "salud",
    label: "Salud del sistema",
    href: "/admin/salud",
    description: "Base de datos, despliegues y servicios",
    status: "activo",
  },
  {
    id: "configuracion",
    label: "Configuración",
    href: "/admin/configuracion",
    description: "Los registros y el aviso para todos",
    status: "activo",
  },
  {
    id: "seguridad",
    label: "Seguridad",
    href: "/admin/seguridad",
    description: "Tu verificación en dos pasos",
    status: "activo",
  },
];

/** El nombre y la frase de cada módulo en inglés (en ADMIN_MODULES van en español). */
const ENGLISH: Readonly<Record<AdminModuleId, Pick<AdminModule, "label" | "description">>> = {
  historial: { label: "History", description: "Sign-ups and WhatsApp linking of each account" },
  usuarios: { label: "Users", description: "Accounts, sessions and status" },
  bot: { label: "WhatsApp bot", description: "Messages, errors and Claude usage" },
  categorias: { label: "Categories", description: "The income and expense categories" },
  salud: { label: "System health", description: "Database, deployments and services" },
  configuracion: { label: "Settings", description: "Sign-ups and the notice for everyone" },
  seguridad: { label: "Security", description: "Your two-step verification" },
};

/** Los módulos, con su nombre y su frase en el idioma de la página. */
export const adminModules = (locale: Locale = DEFAULT_LOCALE): readonly AdminModule[] =>
  locale === "es" ? ADMIN_MODULES : ADMIN_MODULES.map((m) => ({ ...m, ...ENGLISH[m.id] }));

export const activeAdminModules = (locale: Locale = DEFAULT_LOCALE) => adminModules(locale).filter((m) => m.status === "activo");

/** Los chips de la subnavegación: Inicio y los módulos activos. */
export const adminNavItems = (locale: Locale = DEFAULT_LOCALE) => [
  { ...ADMIN_HOME, label: locale === "es" ? ADMIN_HOME.label : "Home" },
  ...activeAdminModules(locale),
];

/** El título de una página de la administración: "Usuarios · Administración" (sin sección, "Administración"). */
export function adminTitle(section: string | null, locale: Locale = DEFAULT_LOCALE): string {
  const admin = locale === "es" ? "Administración" : "Administration";
  return section ? `${section} · ${admin}` : admin;
}

/** El nombre de un módulo en el idioma de la página (para el título de su página). */
export const adminModuleLabel = (id: AdminModuleId, locale: Locale = DEFAULT_LOCALE) =>
  adminModules(locale).find((m) => m.id === id)!.label;

/** ¿La página actual es de ese chip? Inicio solo en /admin; un módulo, en toda su ruta. */
export function isCurrentAdminItem(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === ADMIN_HOME.href) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
