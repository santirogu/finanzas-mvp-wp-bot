import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appNotice, user } from "@/db/schema";
import { getRequestLocale } from "@/i18n/request";
import { texts } from "@/i18n/texts";
import { requireAdmin } from "@/lib/session";
import { recordEvent } from "@/modules/account/events";
import { cleanNoticeText, isNoticeTone, NOTICE_MAX_DAYS, NOTICE_MAX_LENGTH, noticeEndBounds, parseBogotaDateTime, type NoticeTone } from "@/modules/notice/notice";
import { confirmAdminCode } from "../shared/confirm-code";
import { formatDateTime } from "../shared/filters";

// Configuración de la app → Aviso para todos (/admin/configuracion): uno a la vez, con fecha de fin. Publicarlo,
// cambiarlo y quitarlo siguen las reglas de las acciones del admin (CLAUDE.md): requireAdmin, el código de Google
// Authenticator, y la fila única de app_notice y su evento en el historial en la misma transacción. Lo que se ve
// lo lee src/modules/notice/current-notice.ts.

export type NoticeView = {
  message: string;
  messageEn: string | null;
  tone: NoticeTone;
  endsAt: Date;
  /** false si ya venció: no se ve, pero sigue aquí hasta que se publique otro o se quite. */
  active: boolean;
  published: { at: Date; by: string | null };
};

/** El aviso publicado (vigente o vencido), o null si no hay. */
export async function getNoticeSettings(now = new Date()): Promise<NoticeView | null> {
  await requireAdmin();
  const [row] = await db
    .select({
      message: appNotice.message,
      messageEn: appNotice.messageEn,
      tone: appNotice.tone,
      endsAt: appNotice.endsAt,
      publishedAt: appNotice.publishedAt,
      by: user.name,
    })
    .from(appNotice)
    .leftJoin(user, eq(user.id, appNotice.publishedBy))
    .where(eq(appNotice.id, 1));
  if (!row || !isNoticeTone(row.tone)) return null;
  return {
    message: row.message,
    messageEn: row.messageEn,
    tone: row.tone,
    endsAt: row.endsAt,
    active: row.endsAt > now,
    published: { at: row.publishedAt, by: row.by },
  };
}

/** Para la tarjeta de Inicio: hasta cuándo se ve el aviso, o null si no hay uno vigente. */
export async function noticeSummary(now = new Date()): Promise<{ endsAt: Date } | null> {
  await requireAdmin();
  const [row] = await db.select({ endsAt: appNotice.endsAt }).from(appNotice).where(eq(appNotice.id, 1));
  return row && row.endsAt > now ? { endsAt: row.endsAt } : null;
}

type Field = "code" | "message" | "messageEn" | "tone" | "endsAt";
export type NoticeResult = { ok: true; message: string } | { ok: false; error: string; field?: Field };
const fail = (error: string, field?: Field): NoticeResult => ({ ok: false, error, ...(field && { field }) });

const TEXTS = texts(
  {
    message: "Escribe el aviso.",
    tooLong: `Puede tener hasta ${NOTICE_MAX_LENGTH} caracteres.`,
    tone: "Elige el tipo de aviso.",
    endsAt: "Elige la fecha y la hora de fin.",
    past: "Esa fecha ya pasó: elige una más adelante.",
    tooFar: `Un aviso puede durar hasta ${NOTICE_MAX_DAYS} días.`,
    published: (until: string) => `Se publicó el aviso: se ve hasta el ${until}.`,
    removed: "Se quitó el aviso para todos.",
    none: "No hay ningún aviso para quitar.",
  },
  {
    en: {
      message: "Write the notice.",
      tooLong: `It can have up to ${NOTICE_MAX_LENGTH} characters.`,
      tone: "Choose the type of notice.",
      endsAt: "Choose the end date and time.",
      past: "That date has passed: choose a later one.",
      tooFar: `A notice can last up to ${NOTICE_MAX_DAYS} days.`,
      published: (until) => `The notice was published: it shows until ${until}.`,
      removed: "The notice for everyone was removed.",
      none: "There's no notice to remove.",
    },
  },
);

export type PublishNoticeInput = { message: unknown; messageEn: unknown; tone: unknown; endsAt: unknown; code: string };

/**
 * Publica el aviso (o lo cambia: es otro, y quien cerró el anterior lo vuelve a ver), con el código de Google
 * Authenticator. `endsAt` es la fecha y hora de fin en hora de Colombia ("2026-10-25T20:00").
 */
export async function publishNotice(input: PublishNoticeInput, now = new Date()): Promise<NoticeResult> {
  const admin = await requireAdmin();
  const locale = await getRequestLocale();
  const t = TEXTS[locale];
  const message = cleanNoticeText(input.message);
  const messageEn = cleanNoticeText(input.messageEn) || null;
  if (!message) return fail(t.message, "message");
  if (message.length > NOTICE_MAX_LENGTH) return fail(t.tooLong, "message");
  if (messageEn && messageEn.length > NOTICE_MAX_LENGTH) return fail(t.tooLong, "messageEn");
  if (!isNoticeTone(input.tone)) return fail(t.tone, "tone");
  const endsAt = parseBogotaDateTime(input.endsAt);
  if (!endsAt) return fail(t.endsAt, "endsAt");
  const bounds = noticeEndBounds(now);
  if (endsAt <= bounds.min) return fail(t.past, "endsAt");
  if (endsAt > bounds.max) return fail(t.tooFar, "endsAt");
  const check = await confirmAdminCode(input.code, now);
  if (!check.ok) return fail(check.error, "code");

  const notice = { message, messageEn, tone: input.tone, endsAt, publishedAt: now, publishedBy: admin.id };
  await db.transaction(async (tx) => {
    await tx
      .insert(appNotice)
      .values({ id: 1, ...notice })
      .onConflictDoUpdate({ target: appNotice.id, set: notice });
    await recordEvent(
      { type: "notice_published", userId: null, adminId: admin.id, details: { notice: { message, tone: notice.tone, endsAt: endsAt.toISOString() } } },
      tx,
    );
  });
  return { ok: true, message: t.published(formatDateTime(endsAt, locale)) };
}

/** Quita el aviso (vigente o vencido), con el código de Google Authenticator. */
export async function removeNotice({ code }: { code: string }, now = new Date()): Promise<NoticeResult> {
  const admin = await requireAdmin();
  const t = TEXTS[await getRequestLocale()];
  const [current] = await db.select().from(appNotice).where(eq(appNotice.id, 1));
  if (!current || !isNoticeTone(current.tone)) return fail(t.none);
  const check = await confirmAdminCode(code, now);
  if (!check.ok) return fail(check.error, "code");

  const removed = await db.transaction(async (tx) => {
    const [row] = await tx.delete(appNotice).where(eq(appNotice.id, 1)).returning({ id: appNotice.id });
    if (!row) return false;
    const notice = { message: current.message, tone: current.tone as NoticeTone, endsAt: current.endsAt.toISOString() };
    await recordEvent({ type: "notice_removed", userId: null, adminId: admin.id, details: { notice } }, tx);
    return true;
  });
  return removed ? { ok: true, message: t.removed } : fail(t.none);
}
