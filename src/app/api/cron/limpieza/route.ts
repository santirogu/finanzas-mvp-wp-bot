import { isCronRequest } from "@/lib/cron-auth";
import { envVar } from "@/lib/env";
import { describeError } from "@/lib/safe-log";
import { runDailyCleanup } from "@/modules/account/retention";
import { CLEANUP_JOB, recordCronRun } from "@/modules/system/cron-runs";

// Limpieza diaria de lo que ya no se conserva (src/modules/account/retention.ts). La llama Vercel
// Cron (vercel.json) con el secreto CRON_SECRET; cualquier otro pedido recibe 401. Cada corrida queda
// en cron_run, con lo que borró o el tipo del error, para /admin/salud.
export async function GET(request: Request) {
  if (!isCronRequest(request.headers.get("authorization"), envVar("CRON_SECRET"))) {
    return new Response("No autorizado", { status: 401 });
  }
  const startedAt = new Date();
  try {
    const result = await runDailyCleanup();
    console.info("[limpieza] datos vencidos borrados", result);
    await recordCronRun({ job: CLEANUP_JOB, startedAt, ok: true, result });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[limpieza] falló", describeError(error));
    await recordCronRun({ job: CLEANUP_JOB, startedAt, ok: false, error });
    return Response.json({ ok: false }, { status: 500 });
  }
}
