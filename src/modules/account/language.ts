import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import type { Theme } from "@/lib/theme";

/**
 * El idioma que eligió en Configuración: queda en su cuenta para ponérselo a cada navegador donde inicie
 * sesión (src/lib/auth.ts). Solo el de la cuenta de la sesión (saveLanguageAction).
 */
export async function saveAccountLocale(userId: string, locale: Locale): Promise<void> {
  await db.update(user).set({ locale }).where(eq(user.id, userId));
}

/**
 * La apariencia que eligió en Configuración: queda en su cuenta para ponérsela a cada navegador donde inicie sesión
 * (src/lib/auth.ts). Solo la de la cuenta de la sesión (saveThemeAction).
 */
export async function saveAccountTheme(userId: string, theme: Theme): Promise<void> {
  await db.update(user).set({ theme }).where(eq(user.id, userId));
}
