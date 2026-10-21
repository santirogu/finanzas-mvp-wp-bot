import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { Locale } from "@/i18n/locales";

/**
 * El idioma que eligió en Mi cuenta: queda en su cuenta para ponérselo a cada navegador donde inicie
 * sesión (src/lib/auth.ts). Solo el de la cuenta de la sesión (saveLanguageAction).
 */
export async function saveAccountLocale(userId: string, locale: Locale): Promise<void> {
  await db.update(user).set({ locale }).where(eq(user.id, userId));
}
