import {
  compareMonths,
  FIRST_MONTH,
  formatMonthLabel,
  formatMonthName,
  type Month,
  type MonthRange,
  monthParam,
  monthRange,
  parseMonthParam,
  shiftMonth,
} from "./dates";

// El mes que se ve en el Resumen, Ingresos y Egresos va en la URL (`?mes=2026-09`): así funcionan el
// botón de atrás y los enlaces. Sin `?mes=` (o con uno inválido o futuro), el mes en curso.

/** El mes que pide la URL, si es válido y no es futuro; si no, el actual. */
export function selectedMonth(param: unknown, current: MonthRange): MonthRange {
  const month = parseMonthParam(param);
  return month && compareMonths(month, current) < 0 ? monthRange(month.year, month.month) : current;
}

/**
 * La dirección de una página en un mes, con otros parámetros (`extra`) después. En el mes actual va
 * sin `?mes=`: es la de siempre.
 */
export function monthHref(path: string, month: Month, current: Month, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(compareMonths(month, current) === 0 ? {} : { mes: monthParam(month) });
  for (const [name, value] of Object.entries(extra)) params.set(name, value);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** "este mes", "en septiembre" o, si es de otro año, "en septiembre de 2025": para las frases de la página. */
export function inMonthPhrase(month: Month, current: Month): string {
  if (compareMonths(month, current) === 0) return "este mes";
  return `en ${formatMonthName(month, { withYear: month.year !== current.year })}`;
}

export type MonthNavData = {
  /** La página (`/dashboard`, `/ingresos`, `/egresos`): la de los enlaces. */
  path: string;
  /** "Septiembre de 2026". */
  label: string;
  selected: Month;
  current: Month;
  /** La flecha "‹"; null solo en FIRST_MONTH. `name` es "agosto de 2026". */
  prev: { href: string; name: string } | null;
  /** La flecha "›"; null en el mes actual (no hay movimientos futuros). */
  next: { href: string; name: string } | null;
  /** "Volver a este mes": null si ya es el actual. */
  backToCurrent: string | null;
  /** Los meses con movimientos ("YYYY-MM"): llevan un punto en la cuadrícula del año. */
  activeMonths: string[];
};

/**
 * Lo que muestra el navegador de meses de una página (`path`) en el mes `selected`. Las flechas van a
 * cualquier mes, tenga o no movimientos: "›" hasta el actual y "‹" hasta FIRST_MONTH.
 */
export function monthNav(path: string, selected: Month, current: Month, activeMonths: string[]): MonthNavData {
  const arrow = (month: Month) => ({
    href: monthHref(path, month, current),
    name: formatMonthName(month, { withYear: true }),
  });
  const isCurrent = compareMonths(selected, current) === 0;
  return {
    path,
    label: formatMonthLabel(selected),
    selected: { year: selected.year, month: selected.month },
    current: { year: current.year, month: current.month },
    prev: compareMonths(selected, FIRST_MONTH) > 0 ? arrow(shiftMonth(selected, -1)) : null,
    next: isCurrent ? null : arrow(shiftMonth(selected, 1)),
    backToCurrent: isCurrent ? null : path,
    activeMonths,
  };
}

const shortMonth = new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" });

export type MonthCell = {
  /** "sept" (lo que se ve). */
  short: string;
  /** "septiembre de 2026" (lo que lee el lector de pantalla). */
  name: string;
  /** null en un mes futuro: no se puede elegir. */
  href: string | null;
  selected: boolean;
  current: boolean;
  /** Tiene movimientos. */
  active: boolean;
};

/** Los 12 meses de un año en la cuadrícula del navegador (`nav`), de enero a diciembre. */
export function yearGrid(nav: MonthNavData, year: number): MonthCell[] {
  const active = new Set(nav.activeMonths);
  return Array.from({ length: 12 }, (_, i) => {
    const month = { year, month: i + 1 };
    return {
      short: shortMonth.format(new Date(Date.UTC(year, i, 1))).replace(".", ""),
      name: formatMonthName(month, { withYear: true }),
      href: compareMonths(month, nav.current) > 0 ? null : monthHref(nav.path, month, nav.current),
      selected: compareMonths(month, nav.selected) === 0,
      current: compareMonths(month, nav.current) === 0,
      active: active.has(monthParam(month)),
    };
  });
}

/** Los años a los que llevan las flechas de la cuadrícula: null si no hay (antes de 2000, después del actual). */
export function yearArrows(nav: MonthNavData, year: number) {
  return {
    prev: year > FIRST_MONTH.year ? year - 1 : null,
    next: year < nav.current.year ? year + 1 : null,
  };
}
