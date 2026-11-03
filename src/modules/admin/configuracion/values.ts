import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appValues, user } from "@/db/schema";
import { getRequestLocale } from "@/i18n/request";
import { texts } from "@/i18n/texts";
import { requireAdmin } from "@/lib/session";
import { recordEvent } from "@/modules/account/events";
import { getAppValues } from "@/modules/app-values/current";
import { APP_VALUE_BOUNDS, type AppValueField, type AppValues, parseAppValues, sameAppValues } from "@/modules/app-values/values";
import { confirmAdminCode } from "../shared/confirm-code";

// Configuración de la app → Valores de la app (/admin/configuracion): los avisos de próximos pagos por defecto y
// los umbrales (src/modules/app-values/). Cambiarlos sigue las reglas de las acciones del admin (CLAUDE.md):
// requireAdmin, el código de Google Authenticator, y la fila única de app_values y su evento en el historial (con
// los de antes) en la misma transacción.

export type AppValuesSettings = {
  values: AppValues;
  /** El último cambio, o null si nadie los ha cambiado (los de siempre). */
  updated: { at: Date; by: string | null } | null;
};

/** Los valores que valen ahora y quién los cambió por última vez. */
export async function getAppValuesSettings(): Promise<AppValuesSettings> {
  await requireAdmin();
  const [values, [row]] = await Promise.all([
    getAppValues(),
    db.select({ at: appValues.updatedAt, by: user.name }).from(appValues).leftJoin(user, eq(user.id, appValues.updatedBy)).where(eq(appValues.id, 1)),
  ]);
  return { values, updated: row ? { at: row.at, by: row.by } : null };
}

type Field = "code" | AppValueField;
export type AppValuesResult = { ok: true; message: string } | { ok: false; error: string; field?: Field };
const fail = (error: string, field?: Field): AppValuesResult => ({ ok: false, error, ...(field && { field }) });

const { upcomingDays, budgetNearShare, recurringWindow, recurringMinMonths } = APP_VALUE_BOUNDS;

const TEXTS = texts(
  {
    fields: {
      upcomingDays: `Escribe un número de días de ${upcomingDays.min} a ${upcomingDays.max}.`,
      budgetNearShare: `Escribe un porcentaje de ${budgetNearShare.min} a ${budgetNearShare.max}.`,
      recurringWindow: `Escribe de ${recurringWindow.min} a ${recurringWindow.max} meses.`,
      recurringMinMonths: `Escribe de ${recurringMinMonths.min} meses hasta los que se miran.`,
    } satisfies Record<AppValueField, string>,
    same: "Los valores ya son esos: cambia alguno.",
    saved: "Se guardaron los valores de la app.",
  },
  {
    en: {
      fields: {
        upcomingDays: `Enter a number of days from ${upcomingDays.min} to ${upcomingDays.max}.`,
        budgetNearShare: `Enter a percentage from ${budgetNearShare.min} to ${budgetNearShare.max}.`,
        recurringWindow: `Enter from ${recurringWindow.min} to ${recurringWindow.max} months.`,
        recurringMinMonths: `Enter from ${recurringMinMonths.min} months up to the ones checked.`,
      },
      same: "The values are already those: change one.",
      saved: "The app values were saved.",
    },
  },
);

export type AppValuesInput = Record<AppValueField | "upcomingEnabled", unknown> & { code: string };

/** Cambia los valores de la app, con el código de Google Authenticator. */
export async function setAppValues(input: AppValuesInput, now = new Date()): Promise<AppValuesResult> {
  const admin = await requireAdmin();
  const t = TEXTS[await getRequestLocale()];
  const parsed = parseAppValues(input);
  if (!parsed.ok) return fail(t.fields[parsed.field], parsed.field);
  const previous = await getAppValues();
  if (sameAppValues(parsed.values, previous)) return fail(t.same);
  const check = await confirmAdminCode(input.code, now);
  if (!check.ok) return fail(check.error, "code");

  const values = parsed.values;
  await db.transaction(async (tx) => {
    await tx
      .insert(appValues)
      .values({ id: 1, ...values, updatedAt: now, updatedBy: admin.id })
      .onConflictDoUpdate({ target: appValues.id, set: { ...values, updatedAt: now, updatedBy: admin.id } });
    await recordEvent({ type: "app_values_changed", userId: null, adminId: admin.id, details: { appValues: values, previousAppValues: previous } }, tx);
  });
  return { ok: true, message: t.saved };
}
