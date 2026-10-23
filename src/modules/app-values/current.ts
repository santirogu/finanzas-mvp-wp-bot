import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { appValues } from "@/db/schema";
import { appValuesFrom, DEFAULT_APP_VALUES, type AppValues } from "./values";

// Los valores de la app que valen ahora (los avisos por defecto y los umbrales): los que eligió el admin o, sin
// elegir, los de siempre. No pide sesión: los usan las consultas de cada cuenta, el bot y las páginas que los
// explican. Con `cache`, una sola consulta por pedido aunque los pidan varias partes de la página.

export const getAppValues = cache(async (): Promise<AppValues> => {
  const [row] = await db
    .select({
      upcomingEnabled: appValues.upcomingEnabled,
      upcomingDays: appValues.upcomingDays,
      budgetNearShare: appValues.budgetNearShare,
      recurringMinMonths: appValues.recurringMinMonths,
      recurringWindow: appValues.recurringWindow,
    })
    .from(appValues)
    .where(eq(appValues.id, 1));
  return row ? appValuesFrom(row) : DEFAULT_APP_VALUES;
});
