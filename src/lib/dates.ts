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

export function formatMonthLabel({ year, month }: Pick<MonthRange, "year" | "month">): string {
  const label = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "2026-10-13" → "13 oct" */
export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(".", "");
}
