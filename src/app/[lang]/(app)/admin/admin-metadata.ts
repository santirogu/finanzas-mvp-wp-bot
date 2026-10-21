import "server-only";
import type { Metadata } from "next";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { hasRole } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { adminModuleLabel, adminTitle, type AdminModuleId } from "@/modules/admin/modules";

/**
 * El título de una página de la administración ("Usuarios · Administración"). Next lo arma aparte de la
 * página, sin esperar al marco que valida el rol: a quien no es admin (que recibe el 404) no le llega, ni
 * siquiera el nombre de la sección. `section`: un módulo, un nombre en cada idioma o null (Inicio).
 */
export async function adminMetadata(section: AdminModuleId | Readonly<Record<Locale, string>> | null): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, "admin")) return {};
  const locale = await getLocale();
  const label = section === null ? null : typeof section === "string" ? adminModuleLabel(section, locale) : section[locale];
  return { title: adminTitle(label, locale) };
}
