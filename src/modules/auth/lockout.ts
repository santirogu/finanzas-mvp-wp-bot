import "server-only";
import { eq, lt, sql } from "drizzle-orm";
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

/**
 * Suma un intento fallido (en una sola operación, para que dos pedidos simultáneos no se pisen) y
 * bloquea la cuenta al llegar al máximo. Si el primer fallo ya salió de la ventana, empieza de cero.
 */
export async function recordFailure(email: string, now = new Date()) {
  // En SQL crudo las fechas van como texto ISO con su tipo: el driver no convierte los Date.
  const at = (date: Date) => sql`${date.toISOString()}::timestamptz`;
  const windowStart = new Date(now.getTime() - minutes(LOCKOUT.windowMinutes));
  const lockEnd = new Date(now.getTime() + minutes(LOCKOUT.lockMinutes));
  const expired = sql`${loginFailure.firstFailureAt} <= ${at(windowStart)}`;
  const failures = sql`case when ${expired} then 1 else ${loginFailure.failures} + 1 end`;

  const [row] = await db
    .insert(loginFailure)
    .values({ email, failures: 1, firstFailureAt: now, lockedUntil: null })
    .onConflictDoUpdate({
      target: loginFailure.email,
      set: {
        failures,
        firstFailureAt: sql`case when ${expired} then ${at(now)} else ${loginFailure.firstFailureAt} end`,
        lockedUntil: sql`case when ${failures} >= ${LOCKOUT.maxFailures} then ${at(lockEnd)} else null end`,
      },
    })
    .returning({ failures: loginFailure.failures, lockedUntil: loginFailure.lockedUntil });

  // Limpieza: los registros viejos ya no bloquean nada.
  await db.delete(loginFailure).where(lt(loginFailure.firstFailureAt, new Date(now.getTime() - minutes(24 * 60))));
  return row;
}

/** Tras un login correcto, el contador vuelve a cero. */
export async function clearFailures(email: string) {
  await db.delete(loginFailure).where(eq(loginFailure.email, email));
}
