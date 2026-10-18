/** Fecha de hoy (YYYY-MM-DD) en la zona horaria indicada. */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type MonthRange = {
  /** Primer día del mes, inclusive (YYYY-MM-DD). */
  start: string;
  /** Primer día del mes siguiente, exclusivo (YYYY-MM-DD). */
  end: string;
  year: number;
  month: number; // 1-12
};

/** Rango del mes en curso según la zona horaria del usuario. */
export function currentMonthRange(timezone: string, now: Date = new Date()): MonthRange {
  const [year, month] = todayInTimezone(timezone, now).split("-").map(Number);
  return monthRange(year, month);
}

export function monthRange(year: number, month: number): MonthRange {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${next.y}-${pad(next.m)}-01`,
    year,
    month,
  };
}

/** Un mes, sin sus días: el que se navega en el Resumen, Ingresos y Egresos (`?mes=`). */
export type Month = Pick<MonthRange, "year" | "month">;

export function formatMonthLabel({ year, month }: Month): string {
  const label = formatMonthName({ year, month }, { withYear: true });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "septiembre" (o "septiembre de 2025", con el año), en minúscula: para usarlo dentro de una frase. */
export function formatMonthName({ year, month }: Month, { withYear = false } = {}): string {
  return new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** El primer mes que se puede pedir en la URL (y adonde llega la flecha "‹"). */
export const FIRST_MONTH: Month = { year: 2000, month: 1 };

/** El valor de `?mes=` para un mes: "2026-09". */
export function monthParam({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Lee `?mes=` ("2026-09"); null si no es un mes válido (sin futuro: eso lo decide quien lo usa). */
export function parseMonthParam(value: unknown): Month | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  return year < FIRST_MONTH.year ? null : { year, month: Number(match[2]) };
}

/** El mes de una fecha (YYYY-MM-DD). */
export function monthOf(isoDate: string): Month {
  const [year, month] = isoDate.split("-").map(Number);
  return { year, month };
}

/**
 * La fecha que propone el formulario de un mes (YYYY-MM-DD): el mismo día que `today` en ese mes o,
 * si el mes no lo tiene, su último día (el 31 en septiembre es el 30). En el mes de hoy, hoy.
 */
export function sameDayIn(month: Month, today: string): string {
  const day = Number(today.slice(8, 10));
  const lastDay = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  return `${monthParam(month)}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** El mes `delta` meses después (o antes, si es negativo). */
export function shiftMonth({ year, month }: Month, delta: number): Month {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Negativo si `a` es anterior a `b`, cero si es el mismo mes, positivo si es posterior. */
export function compareMonths(a: Month, b: Month): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** "2026-10-13" → "13 de oct" */
export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(".", "");
}

/** "2026-10-13" → "martes 13 de octubre de 2026" */
export function formatLongDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(",", "");
}
