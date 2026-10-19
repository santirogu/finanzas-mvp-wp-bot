import { currentMonthRange } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { csvFileName, movementsCsv } from "@/modules/reports/csv";
import { reportPeriod } from "@/modules/reports/period";
import { listPeriodMovements } from "@/modules/reports/queries";

// "Descargar movimientos" de Reportes: los movimientos del período que pide la URL (?periodo=, el mismo
// de la página) en un CSV para Excel. Solo los de la persona de la sesión; sin sesión, el proxy manda
// al login (y requireUser también). Lee la sesión: corre en cada pedido, nunca se cachea.
export async function GET(request: Request) {
  const user = await requireUser();
  const period = reportPeriod(new URL(request.url).searchParams.get("periodo"), currentMonthRange(user.timezone));
  const rows = await listPeriodMovements(user.id, period.months[0], period.months[period.months.length - 1]);
  return new Response(movementsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFileName(period)}"`,
      // Son datos de la persona: ni el navegador ni nada en el medio los guarda.
      "Cache-Control": "no-store",
    },
  });
}
