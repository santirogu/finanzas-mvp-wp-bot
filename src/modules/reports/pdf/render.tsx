import path from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import { FONT, ReportDocument } from "./document";
import type { ReportPdfView } from "./view";

// La fuente de la app (Geist, licencia OFL: fonts/OFL.txt), incrustada en el PDF: la fuente estándar de
// los PDF no tiene el signo menos de los montos (−, U+2212) ni las flechas. Se lee del disco: en Vercel,
// next.config.ts la incluye en la función de la ruta (outputFileTracingIncludes).
export const FONTS_DIR = path.join(process.cwd(), "src/modules/reports/pdf/fonts");

Font.register({
  family: FONT,
  fonts: [
    { src: path.join(FONTS_DIR, "Geist-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONTS_DIR, "Geist-SemiBold.ttf"), fontWeight: 600 },
  ],
});
// Sin guiones al partir palabras: la separación por defecto es la del inglés.
Font.registerHyphenationCallback((word) => [word]);

/** El "Reporte (PDF)" listo para descargar. */
export async function renderReportPdf(view: ReportPdfView): Promise<Buffer> {
  return renderToBuffer(<ReportDocument view={view} />);
}
