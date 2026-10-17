import { formatMoney, roundToCents } from "@/lib/money";

/** Cómo le fue a un total frente al mes anterior: la flecha que lo acompaña y la frase. */
export type MonthChange = { direction: "up" | "down" | "same"; text: string };

// El porcentaje ya llega redondeado: el formato solo le pone el punto de los miles.
const percent = new Intl.NumberFormat("es-CO");

/** El balance frente al del mes anterior, en plata: "$120.000,00 más que agosto". */
export function balanceChange(current: number, previous: number, previousMonth: string, currency?: string): MonthChange {
  const diff = roundToCents(current - previous);
  if (diff === 0) return { direction: "same", text: `Igual que ${previousMonth}` };
  return {
    direction: diff > 0 ? "up" : "down",
    text: `${formatMoney(Math.abs(diff), currency)} ${diff > 0 ? "más" : "menos"} que ${previousMonth}`,
  };
}

/**
 * Los ingresos o los egresos frente a los del mes anterior, en porcentaje: "15% más que agosto". Si el
 * mes anterior no tuvo (`previous` en cero), no hay porcentaje que dar: "Sin egresos en agosto".
 */
export function totalChange(
  current: number,
  previous: number,
  previousMonth: string,
  kind: "ingresos" | "egresos",
): MonthChange {
  const diff = roundToCents(current - previous);
  if (diff === 0) return { direction: "same", text: `Igual que ${previousMonth}` };
  const direction = diff > 0 ? "up" : "down";
  if (previous === 0) return { direction, text: `Sin ${kind} en ${previousMonth}` };
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  if (pct === 0) return { direction, text: `Casi igual que ${previousMonth}` };
  return { direction, text: `${percent.format(pct)}% ${diff > 0 ? "más" : "menos"} que ${previousMonth}` };
}
