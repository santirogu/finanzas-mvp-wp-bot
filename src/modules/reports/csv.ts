import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { NO_CATEGORIES } from "@/modules/transactions/search";
import { periodFileName, type ReportPeriod } from "./period";

// El archivo que se descarga desde Reportes ("Descargar movimientos"): los movimientos del período en
// CSV, armado para que Excel lo abra bien con doble clic (y Google Sheets también), con BOM (si no, Excel
// lee mal las tildes) y saltos de línea de Windows. En español, como lo espera el Excel en español:
// separado por ";" y con la coma de los centavos; en inglés, separado por "," y con el punto.

const TEXTS = texts(
  {
    header: ["Fecha", "Tipo", "Descripción", "Categoría", "Monto", "Origen"],
    income: "Ingreso",
    expense: "Egreso",
    separator: ";",
    decimal: ",",
    file: "movimientos",
  },
  {
    en: {
      header: ["Date", "Type", "Description", "Category", "Amount", "Source"],
      income: "Income",
      expense: "Expense",
      separator: ",",
      decimal: ".",
      file: "transactions",
    },
  },
);

/** El encabezado en español (el de siempre). */
export const CSV_HEADER = TEXTS.es.header;

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
 * con un apóstrofo adelante, que lo deja como texto. Con el separador (`;` o, en inglés, `,`), comillas o
 * saltos de línea, entre comillas.
 */
export function csvText(value: string, separator = ";"): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return safe.includes(separator) || /["\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * Un monto como lo lee Excel: sin separadores de miles ("1800000,50"; en inglés, "1800000.50", con el
 * punto) y, si es un egreso, negativo. Así, sumar la columna da el balance.
 */
export function csvAmount(amount: number, type: CsvMovement["type"], decimal = ","): string {
  const cents = Math.round(amount * 100);
  return `${type === "expense" && cents > 0 ? "-" : ""}${Math.floor(cents / 100)}${decimal}${String(cents % 100).padStart(2, "0")}`;
}

/** El archivo completo, en el idioma de la página: el encabezado y un movimiento por línea, en el orden en que llegan. */
export function movementsCsv(rows: CsvMovement[], locale: Locale = DEFAULT_LOCALE): string {
  const t = TEXTS[locale];
  const lines = rows.map((row) =>
    [
      row.occurredOn,
      row.type === "income" ? t.income : t.expense,
      csvText(row.description, t.separator),
      csvText(row.categoryName ?? NO_CATEGORIES[locale], t.separator),
      csvAmount(row.amount, row.type, t.decimal),
      row.source === "whatsapp" ? "WhatsApp" : "Web",
    ].join(t.separator),
  );
  return `\uFEFF${[t.header.join(t.separator), ...lines].join("\r\n")}\r\n`;
}

/**
 * El nombre del archivo: "movimientos-2025.csv" o, los últimos 12 meses, "movimientos-2025-11-a-2026-10.csv"
 * (en inglés, "transactions-2025-11-to-2026-10.csv").
 */
export const csvFileName = (period: ReportPeriod, locale: Locale = DEFAULT_LOCALE) => periodFileName(TEXTS[locale].file, period, "csv", locale);
