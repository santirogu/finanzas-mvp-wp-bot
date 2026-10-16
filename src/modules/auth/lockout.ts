import "server-only";
import { and, eq, gt, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginFailure } from "@/db/schema";

// Bloqueo por cuenta: complementa el límite por IP de Better Auth (3 intentos cada 10 s), que no
// frena a quien reparte los intentos entre muchas IPs. Tras MAX_FAILURES contraseñas equivocadas
// en WINDOW_MINUTES, la cuenta queda bloqueada LOCK_MINUTES, venga el intento de donde venga.
// Contra: alguien podría bloquear a propósito la cuenta de otra persona; por eso el bloqueo es
// corto y se levanta solo.
export const LOCKOUT = { maxFailures: 5, windowMinutes: 15, lockMinutes: 15 } as const;

const minutes = (n: number) => n * 60_000;

/** Correo en la forma en que se guarda (sin espacios, en minúsculas); "" si no es texto. */
export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/** Hasta cuándo está bloqueada la cuenta, o null si no lo está. */
export async function lockedUntil(email: string, now = new Date()): Promise<Date | null> {
  const [row] = await db
    .select({ lockedUntil: loginFailure.lockedUntil })
    .from(loginFailure)
    .where(eq(loginFailure.email, email));
  return row?.lockedUntil && row.lockedUntil > now ? row.lockedUntil : null;
}

/** En SQL crudo las fechas van como texto ISO con su tipo: el driver no convierte los Date. */
const at = (date: Date) => sql`${date.toISOString()}::timestamptz`;

export type Reservation = { ok: true } | { ok: false; lockedUntil: Date };

/**
 * Reserva un intento de contraseña ANTES de verificarla, en una sola operación: cuenta como fallo
 * hasta que se sepa el resultado (releaseAttempt lo devuelve; clearFailures borra todo si la
 * contraseña era correcta). Así, pedidos simultáneos desde muchas IPs no pasan todos la revisión
 * antes de que se registre el primer fallo: como mucho LOCKOUT.maxFailures se verifican. Si la cuenta
 * está bloqueada o ya se usaron los intentos de la ventana, no reserva y dice hasta cuándo.
 */
export async function reserveAttempt(email: string, now = new Date()): Promise<Reservation> {
  const windowStart = new Date(now.getTime() - minutes(LOCKOUT.windowMinutes));
  const lockEnd = new Date(now.getTime() + minutes(LOCKOUT.lockMinutes));
  // Se vuelve a contar desde uno si el primer intento salió de la ventana o si ya pasó un bloqueo.
  const restart = sql`(${loginFailure.firstFailureAt} <= ${at(windowStart)}
    or (${loginFailure.lockedUntil} is not null and ${loginFailure.lockedUntil} <= ${at(now)}))`;
  const failures = sql`case when ${restart} then 1 else ${loginFailure.failures} + 1 end`;

  const reserved = await db
    .insert(loginFailure)
    .values({ email, failures: 1, firstFailureAt: now, lockedUntil: null })
    .onConflictDoUpdate({
      target: loginFailure.email,
      set: {
        failures,
        firstFailureAt: sql`case when ${restart} then ${at(now)} else ${loginFailure.firstFailureAt} end`,
        lockedUntil: sql`case when ${failures} >= ${LOCKOUT.maxFailures} then ${at(lockEnd)} else null end`,
      },
      // Sin bloqueo vigente y con intentos libres (o se vuelve a contar desde uno).
      setWhere: sql`(${loginFailure.lockedUntil} is null or ${loginFailure.lockedUntil} <= ${at(now)})
        and (${restart} or ${loginFailure.failures} < ${LOCKOUT.maxFailures})`,
    })
    .returning({ email: loginFailure.email });

  // Limpieza: los registros viejos ya no bloquean nada.
  await db.delete(loginFailure).where(lt(loginFailure.firstFailureAt, new Date(now.getTime() - minutes(24 * 60))));
  if (reserved.length > 0) return { ok: true };
  return { ok: false, lockedUntil: (await lockedUntil(email, now)) ?? lockEnd };
}

/**
 * Devuelve un intento reservado que no terminó en una contraseña equivocada (por ejemplo, un error
 * de validación o una cuenta suspendida): no debe contar como fallo.
 */
export async function releaseAttempt(email: string) {
  await db
    .update(loginFailure)
    .set({
      failures: sql`${loginFailure.failures} - 1`,
      lockedUntil: sql`case when ${loginFailure.failures} - 1 >= ${LOCKOUT.maxFailures} then ${loginFailure.lockedUntil} else null end`,
    })
    .where(and(eq(loginFailure.email, email), gt(loginFailure.failures, 0)));
  await db.delete(loginFailure).where(and(eq(loginFailure.email, email), lte(loginFailure.failures, 0)));
}

/** Tras un login correcto, el contador vuelve a cero. */
export async function clearFailures(email: string) {
  await db.delete(loginFailure).where(eq(loginFailure.email, email));
}
