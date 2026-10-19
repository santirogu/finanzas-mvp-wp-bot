"use client";

import Link from "next/link";
import { useState } from "react";
import { formatShare, formatMoney } from "@/lib/money";
import type { ExpenseRow } from "@/modules/reports/biggest";
import type { CalendarDay, HeatLevel } from "@/modules/reports/daily";
import { NO_CATEGORY } from "@/modules/transactions/search";

// "¿Qué días gastas más?": el calendario de un mes con el tono de cada día según lo que se gastó (sin los
// gastos fijos), el detalle del día que se toca, el promedio por día de la semana y las quincenas.

/**
 * Los tonos, del naranja de los egresos sobre la tarjeta. El número del día va con el color del texto en
 * los tres claros y con el de la tarjeta en el más oscuro: src/color-contrast.test.ts revisa estas clases.
 */
const HEAT: Record<HeatLevel, string> = {
  0: "bg-background text-foreground",
  1: "bg-expense/12 text-foreground",
  2: "bg-expense/25 text-foreground",
  3: "bg-expense/45 text-foreground",
  4: "bg-expense text-surface",
};

const CHEVRON_LEFT =
  "M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z";
const CHEVRON_RIGHT =
  "M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z";

export type MonthLink = { href: string; name: string } | null;

export type DailySpendingProps = {
  /** "Octubre de 2026". */
  monthLabel: string;
  prev: MonthLink;
  next: MonthLink;
  /** Cuántos días de la semana van antes del 1 (0 si el mes empieza un lunes). */
  offset: number;
  /** Los días del mes; `name` es el de la fecha para el lector de pantalla ("sábado 10 de octubre"). */
  days: (CalendarDay & { name: string })[];
  /** De lunes a domingo. */
  weekdays: { label: string; average: number }[];
  /** "Gastas más los sábados: …", o null si no hay con qué comparar. */
  insight: string | null;
  halves: { first: number; second: number };
  currency: string;
  /** Sin egresos (o solo gastos fijos) en el período: lo que se dice en vez del calendario. */
  empty: string | null;
};

const count = (n: number) => `${n} ${n === 1 ? "egreso" : "egresos"}`;

/** El día que se ve primero: el de más gasto del mes (si hubo alguno). */
const topDay = (days: CalendarDay[]) =>
  days.reduce<CalendarDay | null>((top, day) => (day.total > 0 && (!top || day.total > top.total) ? day : top), null)?.date ?? null;

export function DailySpending({ monthLabel, prev, next, offset, days, weekdays, insight, halves, currency, empty }: DailySpendingProps) {
  const money = (n: number) => formatMoney(n, currency);
  // Al cambiar de mes con las flechas, la página lo vuelve a crear (key): empieza en su día de más gasto.
  const [selected, setSelected] = useState(() => topDay(days));
  const day = days.find((d) => d.date === selected) ?? null;
  const top = Math.max(...weekdays.map((w) => w.average));
  const halvesTotal = halves.first + halves.second;

  return (
    <section className="card p-4" aria-label="¿Qué días gastas más?">
      <h2 className="font-semibold">¿Qué días gastas más?</h2>
      <p className="mt-1 text-sm text-muted">Lo que gastaste cada día, sin los gastos fijos. Toca un día para ver qué fue.</p>
      {empty ? (
        <p className="py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* A todo el ancho de su columna, con los días de alto fijo (no cuadrados): en un iPad serían enormes. */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Arrow link={prev} label="Mes anterior" path={CHEVRON_LEFT} />
              <h3 className="text-sm font-medium">{monthLabel}</h3>
              <Arrow link={next} label="Mes siguiente" path={CHEVRON_RIGHT} />
            </div>
            {/* Cada día dice su día de la semana al lector de pantalla: estas iniciales son solo para la vista. */}
            <div aria-hidden className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {["L", "M", "M", "J", "V", "S", "D"].map((initial, i) => (
                <span key={i}>{initial}</span>
              ))}
            </div>
            <ol className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: offset }, (_, i) => (
                <li key={`antes-${i}`} aria-hidden />
              ))}
              {days.map((d) => (
                <li key={d.date}>
                  {d.future ? (
                    // Un día que todavía no llega (el mes en curso): sin tono y sin detalle.
                    <span aria-hidden className="flex h-11 items-center justify-center text-sm tabular-nums text-muted pointer-fine:h-10">
                      {d.day}
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-pressed={d.date === selected}
                      aria-label={`${d.name}: ${d.total > 0 ? `${money(d.total)} en ${count(d.count)}` : "sin egresos"}`}
                      onClick={() => setSelected(d.date)}
                      className={`flex h-11 w-full items-center justify-center rounded-md text-sm tabular-nums transition pointer-fine:h-10 ${HEAT[d.level]} ${d.date === selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""}`}
                    >
                      {d.day}
                    </button>
                  )}
                </li>
              ))}
            </ol>
            <div aria-hidden className="mt-2 flex items-center justify-end gap-1 text-xs text-muted">
              Menos
              {([0, 1, 2, 3, 4] as const).map((level) => (
                <span key={level} className={`size-3 rounded-sm ${HEAT[level]}`} />
              ))}
              Más
            </div>
            <DayDetail day={day} money={money} />
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium">Por día de la semana</h3>
              <p className="mt-0.5 text-xs text-muted">Lo que gastas en promedio cada día, contando los días sin gastos.</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {weekdays.map((w) => (
                  <li key={w.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2">
                    <span className={w.average === top && top > 0 ? "font-medium" : "text-muted"}>{w.label}</span>
                    <span aria-hidden className="h-2 rounded-full bg-background">
                      <span className="block h-full rounded-full bg-expense/70" style={{ width: `${top > 0 ? (w.average / top) * 100 : 0}%` }} />
                    </span>
                    <span className="whitespace-nowrap tabular-nums">{money(w.average)}</span>
                  </li>
                ))}
              </ul>
              {insight && <p className="mt-3 text-sm">{insight}</p>}
            </div>
            <div>
              <h3 className="text-sm font-medium">Por quincena</h3>
              <div aria-hidden className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-background">
                <span className="h-full bg-expense/70" style={{ width: `${halvesTotal > 0 ? (halves.first / halvesTotal) * 100 : 0}%` }} />
                <span className="h-full bg-expense/25" style={{ width: `${halvesTotal > 0 ? (halves.second / halvesTotal) * 100 : 0}%` }} />
              </div>
              <ul className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-xs text-muted">
                <li>Del 1 al 15: {formatShare(halves.first, halvesTotal)}%</li>
                <li>Del 16 al fin de mes: {formatShare(halves.second, halvesTotal)}%</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Cuántos egresos del día se ven de entrada; los demás, con "Ver los N siguientes". */
const DAY_SHOWN = 10;

/** Lo que se gastó el día elegido: el total y cada egreso, que se toca para editarlo. */
function DayDetail({ day, money }: { day: CalendarDay | null; money: (n: number) => string }) {
  const row = (expense: ExpenseRow) => (
    <li key={expense.id}>
      {/* Al guardar, se vuelve a Egresos, al mes del movimiento (como desde cualquier lista). */}
      <Link
        href={`/movimientos/${expense.id}/editar`}
        className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-surface"
      >
        <span className="min-w-0">
          <span className="sr-only">Editar </span>
          <span className="block truncate">
            <span aria-hidden>{expense.categoryEmoji ?? "•"} </span>
            {expense.description}
          </span>
          <span className="block text-xs text-muted">{expense.categoryName ?? NO_CATEGORY}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap tabular-nums text-expense">−{money(expense.amount)}</span>
      </Link>
    </li>
  );
  return (
    <div className="mt-3 rounded-lg bg-background p-3 text-sm">
      {!day ? (
        <p className="text-muted">Toca un día para ver qué gastaste.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h4 className="font-medium">{day.title}</h4>
            {day.total > 0 && <span className="whitespace-nowrap font-semibold tabular-nums text-expense">−{money(day.total)}</span>}
          </div>
          <p className="text-xs text-muted">{day.total > 0 ? count(day.count) : "No gastaste nada ese día (sin contar los gastos fijos)."}</p>
          {day.expenses.length > 0 && <ul className="mt-1 divide-y divide-border">{day.expenses.slice(0, DAY_SHOWN).map(row)}</ul>}
          {/* Un día con muchos: los demás, como en "Los gastos más grandes" (cerrados de nuevo en cada día). */}
          {day.expenses.length > DAY_SHOWN && (
            <details key={day.date}>
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand pointer-fine:min-h-8">
                Ver {day.expenses.length === DAY_SHOWN + 1 ? "el siguiente" : `los ${day.expenses.length - DAY_SHOWN} siguientes`}
              </summary>
              <ul className="divide-y divide-border border-t border-border">{day.expenses.slice(DAY_SHOWN).map(row)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Una flecha de mes del calendario: un enlace al mes de al lado del período o, si no hay, apagada. */
function Arrow({ link, label, path }: { link: MonthLink; label: string; path: string }) {
  const box = "inline-flex size-11 shrink-0 items-center justify-center rounded-lg pointer-fine:size-8";
  const icon = (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-5" aria-hidden>
      <path fillRule="evenodd" d={path} clipRule="evenodd" />
    </svg>
  );
  if (!link) {
    return (
      <span role="link" aria-disabled="true" aria-label={label} className={`${box} text-control/60`}>
        {icon}
      </span>
    );
  }
  // Sin subir al comienzo de la página: el calendario está abajo.
  return (
    <Link href={link.href} scroll={false} aria-label={`${label}: ${link.name}`} className={`${box} text-muted hover:bg-border/60 hover:text-foreground`}>
      {icon}
    </Link>
  );
}
