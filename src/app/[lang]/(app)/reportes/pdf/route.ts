import { requireUser } from "@/lib/session";
import { periodFileName } from "@/modules/reports/period";
import { reportPdfData } from "@/modules/reports/pdf/data";
import { renderReportPdf } from "@/modules/reports/pdf/render";

// "Reporte (PDF)" de Reportes: lo que muestra la página para el período que pide la URL (?periodo=), en
// un PDF tamaño carta para guardar o imprimir. Solo los datos de la persona de la sesión; sin sesión, el
// proxy manda al login (y requireUser también). Lee la sesión: corre en cada pedido, nunca se cachea.
export async function GET(request: Request) {
  const user = await requireUser();
  const { period, view } = await reportPdfData(user, new URL(request.url).searchParams.get("periodo"));
  const pdf = await renderReportPdf(view);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${periodFileName("reporte", period, "pdf")}"`,
      // Son datos de la persona: ni el navegador ni nada en el medio los guarda.
      "Cache-Control": "no-store",
    },
  });
}
