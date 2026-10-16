import { isCronRequest } from "@/lib/cron-auth";
import { envVar } from "@/lib/env";
import { describeError } from "@/lib/safe-log";
import { runDailyCleanup } from "@/modules/account/retention";

// Limpieza diaria de lo que ya no se conserva (src/modules/account/retention.ts). La llama Vercel
// Cron (vercel.json) con el secreto CRON_SECRET; cualquier otro pedido recibe 401.
export async function GET(request: Request) {
  if (!isCronRequest(request.headers.get("authorization"), envVar("CRON_SECRET"))) {
    return new Response("No autorizado", { status: 401 });
  }
  try {
    const result = await runDailyCleanup();
    console.info("[limpieza] datos vencidos borrados", result);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[limpieza] falló", describeError(error));
    return Response.json({ ok: false }, { status: 500 });
  }
}
