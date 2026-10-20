// Los colores del PDF: los del modo claro de la app (src/app/globals.css), porque el PDF se imprime.
// Escritos aquí porque el PDF no lee CSS; src/modules/reports/pdf/colors.test.ts revisa que sigan
// siendo los mismos de globals.css.
export const PDF_COLORS = {
  background: "#f6f7f9",
  foreground: "#14171c",
  muted: "#5f6672",
  border: "#e3e6eb",
  brand: "#0f766e",
  income: "#137337",
  expense: "#b53c0b",
  /** La paleta de los gráficos (--chart-1 a --chart-7), en el orden de las categorías. */
  chart: ["#2563eb", "#7c3aed", "#b45309", "#db2777", "#0e7490", "#475569", "#c2410c"],
  /** Las categorías que no entran en la paleta (--chart-rest). */
  chartRest: "#868e9c",
} as const;
