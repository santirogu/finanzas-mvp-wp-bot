import "server-only";
import { db } from "@/db";
import { cronRun } from "@/db/schema";
import { describeError } from "@/lib/safe-log";

// El registro de cada corrida de una tarea programada (cron_run), para /admin/salud. Lo escribe la
// ruta de la tarea, que no tiene sesión: por eso no está en src/modules/admin/.

/** La limpieza diaria (/api/cron/limpieza). */
export const CLEANUP_JOB = "limpieza";

export type CronRunRecord = {
  job: string;
  startedAt: Date;
} & ({ ok: true; result: Record<string, number> } | { ok: false; error: unknown });

/**
 * Guarda una corrida. Si no puede (la base no responde), lo deja en los logs y sigue: el registro no
 * debe cambiar lo que responde la tarea.
 */
export async function recordCronRun(run: CronRunRecord): Promise<void> {
  try {
    await db.insert(cronRun).values({
      job: run.job,
      startedAt: run.startedAt,
      // Con el reloj de la app, como el inicio: el de la base puede ir corrido.
      finishedAt: new Date(),
      ok: run.ok,
      result: run.ok ? run.result : null,
      error: run.ok ? null : describeError(run.error),
    });
  } catch (error) {
    console.error(`[${run.job}] no se pudo guardar la corrida`, describeError(error));
  }
}
