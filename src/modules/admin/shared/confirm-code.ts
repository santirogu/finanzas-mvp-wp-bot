import "server-only";
import { symmetricDecrypt } from "better-auth/crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminCodeUse, twoFactor } from "@/db/schema";
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

// La hora ya termina en punto ("4:15 p. m."): no lleva otro.
const lockedMessage = (until: Date) =>
  `Por demasiados códigos equivocados, las acciones y tu inicio de sesión están bloqueados hasta las ${formatHour(until)}`;

/** Confirma el código del admin de la sesión (nunca el de otra cuenta). */
export async function confirmAdminCode(code: string, now = new Date()): Promise<CodeCheck> {
  const admin = await requireAdmin();
  const typed = cleanCode(code);
  if (!isCodeFormat(typed)) return { ok: false, error: "Escribe los 6 dígitos del código de Google Authenticator." };

  const [factor] = await db
    .select({ id: twoFactor.id, secret: twoFactor.secret, lockedUntil: twoFactor.lockedUntil })
    .from(twoFactor)
    .where(and(eq(twoFactor.userId, admin.id), eq(twoFactor.verified, true)));
  // requireAdmin ya exige la verificación activa: esto no debería pasar.
  if (!factor) return { ok: false, error: "Tu verificación en dos pasos no está configurada." };
  if (factor.lockedUntil && factor.lockedUntil > now) return { ok: false, error: lockedMessage(factor.lockedUntil) };

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
    if (row.lockedUntil) return { ok: false, error: `El código no es correcto. ${lockedMessage(row.lockedUntil)}` };
    const left = maxFailedAttempts - row.failures;
    return { ok: false, error: `El código no es correcto. Te ${left === 1 ? "queda 1 intento" : `quedan ${left} intentos`}.` };
  }

  // Solo si es posterior al último usado: el mismo código (o uno anterior) no pasa dos veces.
  const used = await db
    .insert(adminCodeUse)
    .values({ userId: admin.id, lastStep: step, usedAt: now })
    .onConflictDoUpdate({ target: adminCodeUse.userId, set: { lastStep: step, usedAt: now }, setWhere: lt(adminCodeUse.lastStep, step) })
    .returning({ step: adminCodeUse.lastStep });
  if (used.length === 0) return { ok: false, error: "Ese código ya se usó. Espera el siguiente en Google Authenticator." };

  await db.update(twoFactor).set({ failedVerificationCount: 0, lockedUntil: null }).where(eq(twoFactor.id, factor.id));
  return { ok: true };
}
