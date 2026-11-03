import { NEAR_SHARE } from "@/modules/budgets/progress";
import { RECURRING_MIN_MONTHS, RECURRING_WINDOW, type RecurringRule } from "@/modules/reports/recurring";
import { DAYS_AHEAD, MAX_DAYS_AHEAD } from "@/modules/reports/upcoming";

// Los valores de la app que cambia el admin (Configuración → Valores de la app): los avisos de próximos pagos por
// defecto (los de quien no eligió los suyos en Configuración) y los umbrales de todas las cuentas. Sin cambios,
// los de siempre (las constantes de cada módulo). Sin dependencias del servidor: lo usan el servidor, la ventana
// del admin y las páginas que los explican (Fijos, la Ayuda).

export type AppValues = {
  /** Si los avisos de próximos pagos vienen prendidos. */
  upcomingEnabled: boolean;
  /** Con cuántos días de anticipación (de 0, el mismo día, a MAX_DAYS_AHEAD). */
  upcomingDays: number;
  /** Desde qué porcentaje del presupuesto una categoría "se acerca". */
  budgetNearShare: number;
  /** Un gasto es fijo si aparece en al menos `recurringMinMonths` de los últimos `recurringWindow` meses. */
  recurringMinMonths: number;
  recurringWindow: number;
};

export const DEFAULT_APP_VALUES: AppValues = {
  upcomingEnabled: true,
  upcomingDays: DAYS_AHEAD,
  budgetNearShare: NEAR_SHARE,
  recurringMinMonths: RECURRING_MIN_MONTHS,
  recurringWindow: RECURRING_WINDOW,
};

/** Los rangos de cada uno (la base los revisa también: app_values). Los meses mínimos van de 2 a la ventana. */
export const APP_VALUE_BOUNDS = {
  upcomingDays: { min: 0, max: MAX_DAYS_AHEAD },
  budgetNearShare: { min: 50, max: 95 },
  recurringWindow: { min: 3, max: 6 },
  recurringMinMonths: { min: 2 },
} as const;

export type AppValueField = "upcomingDays" | "budgetNearShare" | "recurringMinMonths" | "recurringWindow";

/** Un entero escrito en un campo (con espacios alrededor, también), o null. */
function parseInteger(raw: unknown): number | null {
  return typeof raw === "string" && /^\s*\d{1,3}\s*$/.test(raw) ? Number(raw) : null;
}

const within = (value: number | null, { min, max }: { min: number; max: number }): value is number => value !== null && value >= min && value <= max;

/**
 * Los valores como llegan del formulario del admin: `upcomingEnabled` es el interruptor ("on" si está prendido) y
 * los demás, los campos. Con el primero que no sirve, cuál fue.
 */
export function parseAppValues(raw: Record<AppValueField | "upcomingEnabled", unknown>): { ok: true; values: AppValues } | { ok: false; field: AppValueField } {
  const upcomingDays = parseInteger(raw.upcomingDays);
  if (!within(upcomingDays, APP_VALUE_BOUNDS.upcomingDays)) return { ok: false, field: "upcomingDays" };
  const budgetNearShare = parseInteger(raw.budgetNearShare);
  if (!within(budgetNearShare, APP_VALUE_BOUNDS.budgetNearShare)) return { ok: false, field: "budgetNearShare" };
  const recurringWindow = parseInteger(raw.recurringWindow);
  if (!within(recurringWindow, APP_VALUE_BOUNDS.recurringWindow)) return { ok: false, field: "recurringWindow" };
  const recurringMinMonths = parseInteger(raw.recurringMinMonths);
  if (!within(recurringMinMonths, { min: APP_VALUE_BOUNDS.recurringMinMonths.min, max: recurringWindow })) return { ok: false, field: "recurringMinMonths" };
  return { ok: true, values: { upcomingEnabled: raw.upcomingEnabled === "on", upcomingDays, budgetNearShare, recurringMinMonths, recurringWindow } };
}

/** Lo guardado en la base, como valores: uno fuera de rango (no debería pasar: la base los revisa), el de siempre. */
export function appValuesFrom(row: AppValues): AppValues {
  const parsed = parseAppValues({
    upcomingEnabled: row.upcomingEnabled ? "on" : "",
    upcomingDays: String(row.upcomingDays),
    budgetNearShare: String(row.budgetNearShare),
    recurringMinMonths: String(row.recurringMinMonths),
    recurringWindow: String(row.recurringWindow),
  });
  return parsed.ok ? parsed.values : DEFAULT_APP_VALUES;
}

/** ¿Son los mismos valores? (para no guardar un cambio que no cambia nada). */
export const sameAppValues = (a: AppValues, b: AppValues) =>
  a.upcomingEnabled === b.upcomingEnabled &&
  a.upcomingDays === b.upcomingDays &&
  a.budgetNearShare === b.budgetNearShare &&
  a.recurringMinMonths === b.recurringMinMonths &&
  a.recurringWindow === b.recurringWindow;

/** Cuándo un gasto es fijo, según los valores (para la detección de src/modules/reports/recurring.ts). */
export const recurringRuleOf = (values: AppValues): RecurringRule => ({ minMonths: values.recurringMinMonths, window: values.recurringWindow });
