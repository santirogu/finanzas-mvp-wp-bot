import "server-only";
import { symmetricDecrypt } from "better-auth/crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminCodeUse, twoFactor } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { getRequestLocale } from "@/i18n/request";
import { texts } from "@/i18n/texts";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";
import { TWO_FACTOR_LOCKOUT } from "@/modules/auth/two-factor-rules";
import { formatHour } from "./filters";
import { cleanCode, isCodeFormat, matchingStep } from "./totp";

// Confirmar una acción del admin con el código de Google Authenticator. No usa auth.api.verifyTOTP:
// con la sesión ya abierta, Better Auth no cuenta los intentos fallidos (el bloqueo solo aplica al
// iniciar sesión) y acepta el mismo código varias veces mientras dura. Aquí:
//  - los códigos equivocados suman al mismo contador que el inicio de sesión (columnas del plugin):
//    con TWO_FACTOR_LOCKOUT.maxFailedAttempts seguidos se bloquean las acciones y el inicio de
//    sesión por TWO_FACTOR_LOCKOUT.durationSeconds;
//  - un código sirve una sola vez, y tampoco uno anterior al último usado (tabla admin_code_use).

export type CodeCheck = { ok: true } | { ok: false; error: string };

const at = (date: Date) => sql`${date.toISOString()}::timestamptz`;

// Los mensajes, en el idioma de quien hace el pedido (la cookie): lo usan las acciones de toda la
// administración y "Cambiar contraseña" de Mi cuenta.
const TEXTS = texts(
  {
    // La hora ya termina en punto ("4:15 p. m."): no lleva otro.
    locked: (hour: string) => `Por demasiados códigos equivocados, las acciones y tu inicio de sesión están bloqueados hasta las ${hour}`,
    format: "Escribe los 6 dígitos del código de Google Authenticator.",
    notSetUp: "Tu verificación en dos pasos no está configurada.",
    wrong: "El código no es correcto.",
    left: (n: number) => `Te ${n === 1 ? "queda 1 intento" : `quedan ${n} intentos`}.`,
    used: "Ese código ya se usó. Espera el siguiente en Google Authenticator.",
  },
  {
    en: {
      locked: (hour) => `Because of too many wrong codes, actions and your sign-in are locked until ${hour}.`,
      format: "Enter the 6 digits of the Google Authenticator code.",
      notSetUp: "Your two-step verification isn't set up.",
      wrong: "The code isn't right.",
      left: (n) => `You have ${n === 1 ? "1 attempt" : `${n} attempts`} left.`,
      used: "That code was already used. Wait for the next one in Google Authenticator.",
    },
  },
);

const lockedMessage = (until: Date, locale: Locale) => TEXTS[locale].locked(formatHour(until, locale));

/** Confirma el código del admin de la sesión (nunca el de otra cuenta). */
export async function confirmAdminCode(code: string, now = new Date()): Promise<CodeCheck> {
  const admin = await requireAdmin();
  const locale = await getRequestLocale();
  const t = TEXTS[locale];
  const typed = cleanCode(code);
  if (!isCodeFormat(typed)) return { ok: false, error: t.format };

  const [factor] = await db
    .select({ id: twoFactor.id, secret: twoFactor.secret, lockedUntil: twoFactor.lockedUntil })
    .from(twoFactor)
    .where(and(eq(twoFactor.userId, admin.id), eq(twoFactor.verified, true)));
  // requireAdmin ya exige la verificación activa: esto no debería pasar.
  if (!factor) return { ok: false, error: t.notSetUp };
  if (factor.lockedUntil && factor.lockedUntil > now) return { ok: false, error: lockedMessage(factor.lockedUntil, locale) };

  const { secretConfig } = await auth.$context;
  const secret = await symmetricDecrypt({ key: secretConfig, data: factor.secret });
  const step = matchingStep(secret, typed, now);

  if (step === null) {
    // En una sola operación (dos pedidos a la vez no se pisan). Un bloqueo que ya pasó empieza de cero.
    const { maxFailedAttempts, durationSeconds } = TWO_FACTOR_LOCKOUT;
    const expired = sql`${twoFactor.lockedUntil} is not null and ${twoFactor.lockedUntil} <= ${at(now)}`;
    const failures = sql`case when ${expired} then 1 else ${twoFactor.failedVerificationCount} + 1 end`;
    const [row] = await db
      .update(twoFactor)
      .set({
        failedVerificationCount: failures,
        lockedUntil: sql`case when ${failures} >= ${maxFailedAttempts} then ${at(new Date(now.getTime() + durationSeconds * 1000))} else null end`,
      })
      .where(eq(twoFactor.id, factor.id))
      .returning({ failures: twoFactor.failedVerificationCount, lockedUntil: twoFactor.lockedUntil });
    if (row.lockedUntil) return { ok: false, error: `${t.wrong} ${lockedMessage(row.lockedUntil, locale)}` };
    return { ok: false, error: `${t.wrong} ${t.left(maxFailedAttempts - row.failures)}` };
  }

  // Solo si es posterior al último usado: el mismo código (o uno anterior) no pasa dos veces.
  const used = await db
    .insert(adminCodeUse)
    .values({ userId: admin.id, lastStep: step, usedAt: now })
    .onConflictDoUpdate({ target: adminCodeUse.userId, set: { lastStep: step, usedAt: now }, setWhere: lt(adminCodeUse.lastStep, step) })
    .returning({ step: adminCodeUse.lastStep });
  if (used.length === 0) return { ok: false, error: t.used };

  await db.update(twoFactor).set({ failedVerificationCount: 0, lockedUntil: null }).where(eq(twoFactor.id, factor.id));
  return { ok: true };
}
