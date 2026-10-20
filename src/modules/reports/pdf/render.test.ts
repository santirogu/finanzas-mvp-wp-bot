import { readdirSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Month } from "@/lib/dates";
import { sampleMovements, sampleReport } from "../../../../test/report-sample";
import { ReportDocument } from "./document";
import nextConfig from "../../../../next.config";
import { FONTS_DIR, renderReportPdf } from "./render";
import { type ReportPdfView, reportPdfView } from "./view";

// La hoja del "Reporte (PDF)": que muestre todo lo que trae la vista (src/modules/reports/pdf/view.ts,
// donde se prueban los textos) y que el archivo sea un PDF con las páginas esperadas.

const current: Month = { year: 2026, month: 10 };
const today = "2026-10-20";
const { report, period, byDay } = sampleReport(sampleMovements(current, today), current);
const view = reportPdfView({ report, period, byDay, current, today, name: "Ana", currency: "COP" });
const emptyReport = sampleReport([], current);
const empty = reportPdfView({ ...emptyReport, current, today, name: "Ana", currency: "COP" });

/** El texto de la hoja, sin dibujarla: los componentes son funciones sin estado. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  if (typeof node.type === "function") return textOf((node.type as (props: unknown) => ReactNode)(node.props));
  return textOf(node.props.children);
}

/** Los textos de la vista que se leen en la hoja (no los colores, los tonos ni las medidas). */
function textsIn(value: unknown, key = ""): string[] {
  if (typeof value === "string") return ["color", "tone"].includes(key) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap((item) => textsIn(item));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => textsIn(v, k));
  return [];
}

/** Las páginas del PDF (cada una es un objeto "/Type /Page"; la lista de todas, "/Type /Pages"). */
const pagesOf = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;

describe("ReportDocument", () => {
  it("muestra todos los textos de la vista", () => {
    const text = textOf(ReportDocument({ view }));
    const texts = textsIn(view);
    expect(texts.length).toBeGreaterThan(150);
    for (const t of texts) expect(text, t).toContain(t);
  });

  it("sin la sección de gastos fijos (tienen su pestaña)", () => {
    expect(textOf(ReportDocument({ view }))).not.toContain("Gastos fijos");
  });

  it("sin movimientos, solo el encabezado y el aviso", () => {
    const text = textOf(ReportDocument({ view: empty }));
    expect(text).toContain("Reporte de tus finanzas");
    expect(text).toContain("Aún no tienes movimientos.");
    expect(text).not.toContain("Gastos por categoría");
    expect(text).not.toContain("Mes a mes");
  });

  it("cada sección vacía dice por qué", () => {
    const sections: ReportPdfView = {
      ...view,
      categories: { ...view.categories, rows: [], empty: "Sin egresos en el período." },
      biggest: { rows: [], empty: "Todos los egresos del período son gastos fijos." },
      daily: { ...view.daily, empty: "Sin egresos en el período." },
    };
    const text = textOf(ReportDocument({ view: sections }));
    for (const t of ["Sin egresos en el período.", "Todos los egresos del período son gastos fijos."]) {
      expect(text).toContain(t);
    }
    expect(text).not.toContain(view.daily.halves[0].amount);
  });
});

describe("renderReportPdf", () => {
  it("un año de movimientos: un PDF de dos hojas (el resumen y el detalle)", async () => {
    const pdf = await renderReportPdf(view);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pagesOf(pdf)).toBe(2);
  }, 20_000);

  it("sin movimientos, una sola hoja", async () => {
    expect(pagesOf(await renderReportPdf(empty))).toBe(1);
  }, 20_000);

  it("si el detalle no cabe en la segunda hoja, sigue en las siguientes", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...view.categories.rows[0], name: `Categoría ${i + 1}`, change: "↗ En septiembre, 5% más que su promedio" }));
    const long: ReportPdfView = { ...view, categories: { ...view.categories, rows: many } };
    expect(pagesOf(await renderReportPdf(long))).toBeGreaterThan(2);
  }, 20_000);
});

describe("la fuente en Vercel", () => {
  // render.tsx la lee del disco: si no viaja con la función de la ruta, el PDF falla solo en producción.
  it("next.config.ts incluye en la ruta del PDF los archivos de la fuente", () => {
    expect(nextConfig.outputFileTracingIncludes?.["/[lang]/reportes/pdf"]).toEqual(["./src/modules/reports/pdf/fonts/*.ttf"]);
    expect(FONTS_DIR.endsWith("src/modules/reports/pdf/fonts")).toBe(true);
    expect(readdirSync(FONTS_DIR).filter((file) => file.endsWith(".ttf")).sort()).toEqual(["Geist-Regular.ttf", "Geist-SemiBold.ttf"]);
  });
});
