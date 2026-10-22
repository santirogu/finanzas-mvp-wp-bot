import { connection } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { envVar } from "@/lib/env";
import { checkHealth } from "@/lib/health";
import { describeError } from "@/lib/safe-log";
import { checkClaudeConnection } from "@/modules/bot/claude-extractor";
import { watchProblems } from "@/modules/system/watch";
import { checkWhatsAppConnection } from "@/modules/whatsapp/client";

// La vigilancia de producción: la llama cada hora un workflow de GitHub Actions (.github/workflows/vigilancia.yml)
// con el secreto CRON_SECRET; cualquier otro pedido recibe 401. Revisa lo mismo que /api/health, prueba
// WhatsApp y Claude (sin enviar nada ni gastar créditos) y mira las alertas del bot. Responde solo si hay
// problemas y de qué tipo: el detalle lo ve el admin en Salud y en Bot de WhatsApp.
export async function GET(request: Request) {
  await connection(); // se evalúa en cada request, nunca durante el build
  if (!isCronRequest(request.headers.get("authorization"), envVar("CRON_SECRET"))) {
    return new Response("No autorizado", { status: 401 });
  }

  const [health, whatsapp, claude, botAlerts] = await Promise.all([
    checkHealth({
      latestAppliedMigration: async () => (await import("@/db/migrations-status")).latestAppliedMigration(),
    }),
    checkWhatsAppConnection(),
    checkClaudeConnection(),
    // Import dinámico, como en /api/health: si la base no está, ya lo dice checkHealth.
    import("@/modules/bot/alerts")
      .then(({ collectBotAlerts }) => collectBotAlerts())
      .catch((error: unknown) => {
        console.error("[vigilancia] no se pudieron revisar las alertas del bot", describeError(error));
        return [];
      }),
  ]);
  const problems = watchProblems({ healthOk: health.ok, whatsapp, claude, botAlerts });
  if (problems.length > 0) console.error("[vigilancia] hay problemas", { problemas: problems });

  return Response.json({ ok: problems.length === 0, problems }, { headers: { "Cache-Control": "no-store" } });
}
