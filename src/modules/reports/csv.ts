import { NO_CATEGORY } from "@/modules/transactions/search";
import { periodFileName, type ReportPeriod } from "./period";

// El archivo que se descarga desde Reportes ("Descargar movimientos"): los movimientos del período en
// CSV, armado para que el Excel en español lo abra bien con doble clic (y Google Sheets también):
// separado por ";" (la coma es la de los centavos), con BOM (si no, Excel lee mal las tildes) y con
// saltos de línea de Windows.

export const CSV_HEADER = ["Fecha", "Tipo", "Descripción", "Categoría", "Monto", "Origen"];

/** Un movimiento del período, como lo da la base. */
export type CsvMovement = {
  /** YYYY-MM-DD: Excel lo reconoce como fecha. */
  occurredOn: string;
  type: "income" | "expense";
  description: string;
  categoryName: string | null;
  amount: number;
  source: "web" | "whatsapp";
};

/**
 * Un texto para una celda. Si empieza con `=`, `+`, `-`, `@`, tabulación o retorno, Excel lo tomaría
 * como una fórmula (una descripción como "=HIPERVINCULO(…)" se ejecutaría al abrir el archivo): va
 * con un apóstrofo adelante, que lo deja como texto. Con `;`, comillas o saltos de línea, entre comillas.
 */
export function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * Un monto como lo lee Excel en español: con coma decimal, sin puntos de miles ("1800000,50") y, si
 * es un egreso, negativo. Así, sumar la columna da el balance.
 */
export function csvAmount(amount: number, type: CsvMovement["type"]): string {
  const cents = Math.round(amount * 100);
  return `${type === "expense" && cents > 0 ? "-" : ""}${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

/** El archivo completo: el encabezado y un movimiento por línea, en el orden en que llegan. */
export function movementsCsv(rows: CsvMovement[]): string {
  const lines = rows.map((row) =>
    [
      row.occurredOn,
      row.type === "income" ? "Ingreso" : "Egreso",
      csvText(row.description),
      csvText(row.categoryName ?? NO_CATEGORY),
      csvAmount(row.amount, row.type),
      row.source === "whatsapp" ? "WhatsApp" : "Web",
    ].join(";"),
  );
  return `\uFEFF${[CSV_HEADER.join(";"), ...lines].join("\r\n")}\r\n`;
}

/** El nombre del archivo: "movimientos-2025.csv" o, los últimos 12 meses, "movimientos-2025-11-a-2026-10.csv". */
export const csvFileName = (period: ReportPeriod) => periodFileName("movimientos", period, "csv");
