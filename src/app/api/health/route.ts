import { connection } from "next/server";
import { checkHealth } from "@/lib/health";

/**
 * Estado de la app para los smoke tests del despliegue (scripts/smoke.mjs). Responde solo "ok" o
 * "error" para no exponer la configuración: el detalle queda en los logs de Vercel.
 */
export async function GET() {
  await connection(); // se evalúa en cada request, nunca durante el build

  const result = await checkHealth({
    // Import dinámico: si falta DATABASE_URL, src/db lanza al importarse y queda como un
    // problema más del reporte en vez de romper la ruta.
    latestAppliedMigration: async () => {
      const { latestAppliedMigration } = await import("@/db/migrations-status");
      return latestAppliedMigration();
    },
  });
  if (!result.ok) console.error("[health] la app no está lista", { problemas: result.problems });

  return Response.json(
    { status: result.ok ? "ok" : "error" },
    { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
