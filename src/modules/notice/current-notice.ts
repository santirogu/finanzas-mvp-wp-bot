import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appNotice } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { isNoticeTone, noticeVersion, type VisibleNotice } from "./notice";

// El aviso para todos que se ve ahora (la franja de la app, el login y el registro). No pide sesión: lo ve también
// quien todavía no entró. Lo que lo publica y lo quita es del admin (src/modules/admin/configuracion/notice.ts).

/** El aviso vigente en ese idioma (sin el inglés, el de español), o null si no hay o ya venció. */
export async function getCurrentNotice(locale: Locale, now = new Date()): Promise<VisibleNotice | null> {
  const [row] = await db.select().from(appNotice).where(eq(appNotice.id, 1));
  if (!row || row.endsAt <= now || !isNoticeTone(row.tone)) return null;
  return { message: (locale === "en" && row.messageEn) || row.message, tone: row.tone, version: noticeVersion(row.publishedAt) };
}
