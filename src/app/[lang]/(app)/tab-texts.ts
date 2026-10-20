import { texts } from "@/i18n/texts";

/**
 * El nombre de cada pestaña (src/app/[lang]/(app)/nav-tabs.tsx), que también es el título de su página. Aparte
 * de nav-tabs.tsx, que es de cliente: así lo pueden leer también las páginas, en el servidor. En inglés,
 * Fijos es "Bills": "Recurring" no cabía con las demás en 375 px.
 */
export const TAB_TEXTS = texts(
  { "/dashboard": "Resumen", "/ingresos": "Ingresos", "/egresos": "Egresos", "/gastos-fijos": "Fijos", "/reportes": "Reportes", "/admin": "Admin" },
  { en: { "/dashboard": "Overview", "/ingresos": "Income", "/egresos": "Expenses", "/gastos-fijos": "Bills", "/reportes": "Reports", "/admin": "Admin" } },
);
