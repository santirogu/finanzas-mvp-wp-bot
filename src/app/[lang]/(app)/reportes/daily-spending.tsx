"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { formatShare, formatMoney } from "@/lib/money";
import type { ExpenseRow } from "@/modules/reports/biggest";
import type { CalendarDay, HeatLevel } from "@/modules/reports/daily";
import { NO_CATEGORIES } from "@/modules/transactions/search";

const TEXTS = texts(
  {
    title: "¿Qué días gastas más?",
    intro: "Lo que gastaste cada día, sin los gastos fijos. Toca un día para ver qué fue.",
    prevMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    initials: ["L", "M", "M", "J", "V", "S", "D"],
    count: (n: number) => `${n} ${n === 1 ? "egreso" : "egresos"}`,
    dayLabel: (name: string, amount: string, count: string) => `${name}: ${amount} en ${count}`,
    dayEmpty: (name: string) => `${name}: sin egresos`,
    less: "Menos",
    more: "Más",
    byWeekday: "Por día de la semana",
    byWeekdayIntro: "Lo que gastas en promedio cada día, contando los días sin gastos.",
    byHalf: "Por quincena",
    firstHalf: (pct: string) => `Del 1 al 15: ${pct}%`,
    secondHalf: (pct: string) => `Del 16 al fin de mes: ${pct}%`,
    edit: "Editar ",
    pick: "Toca un día para ver qué gastaste.",
    nothing: "No gastaste nada ese día (sin contar los gastos fijos).",
    seeMore: (n: number) => (n === 1 ? "Ver el siguiente" : `Ver los ${n} siguientes`),
  },
  {
    en: {
      title: "Which days do you spend the most?",
      intro: "What you spent each day, without your bills. Tap a day to see what it was.",
      prevMonth: "Previous month",
      nextMonth: "Next month",
      initials: ["M", "T", "W", "T", "F", "S", "S"],
      count: (n) => `${n} ${n === 1 ? "expense" : "expenses"}`,
      dayLabel: (name, amount, count) => `${name}: ${amount} in ${count}`,
      dayEmpty: (name) => `${name}: no expenses`,
      less: "Less",
      more: "More",
      byWeekday: "By day of the week",
      byWeekdayIntro: "What you spend on average each day, counting the days without spending.",
      byHalf: "By half of the month",
      firstHalf: (pct) => `1st to 15th: ${pct}%`,
      secondHalf: (pct) => `16th to month end: ${pct}%`,
      edit: "Edit ",
      pick: "Tap a day to see what you spent.",
      nothing: "You didn't spend anything that day (not counting your bills).",
      seeMore: (n) => (n === 1 ? "See the next one" : `See the next ${n}`),
    },
  },
);

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


/** El día que se ve primero: el de más gasto del mes (si hubo alguno). */
const topDay = (days: CalendarDay[]) =>
  days.reduce<CalendarDay | null>((top, day) => (day.total > 0 && (!top || day.total > top.total) ? day : top), null)?.date ?? null;

export function DailySpending({ monthLabel, prev, next, offset, days, weekdays, insight, halves, currency, empty }: DailySpendingProps) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const money = (n: number) => formatMoney(n, currency, locale);
  // Al cambiar de mes con las flechas, la página lo vuelve a crear (key): empieza en su día de más gasto.
  const [selected, setSelected] = useState(() => topDay(days));
  const day = days.find((d) => d.date === selected) ?? null;
  const top = Math.max(...weekdays.map((w) => w.average));
  const halvesTotal = halves.first + halves.second;

  return (
    <section className="card p-4" aria-label={t.title}>
      <h2 className="font-semibold">{t.title}</h2>
      <p className="mt-1 text-sm text-muted">{t.intro}</p>
      {empty ? (
        <p className="py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* A todo el ancho de su columna, con los días de alto fijo (no cuadrados): en un iPad serían enormes. */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Arrow link={prev} label={t.prevMonth} path={CHEVRON_LEFT} />
              <h3 className="text-sm font-medium">{monthLabel}</h3>
              <Arrow link={next} label={t.nextMonth} path={CHEVRON_RIGHT} />
            </div>
            {/* Cada día dice su día de la semana al lector de pantalla: estas iniciales son solo para la vista. */}
            <div aria-hidden className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {t.initials.map((initial, i) => (
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
                      aria-label={d.total > 0 ? t.dayLabel(d.name, money(d.total), t.count(d.count)) : t.dayEmpty(d.name)}
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
              {t.less}
              {([0, 1, 2, 3, 4] as const).map((level) => (
                <span key={level} className={`size-3 rounded-sm ${HEAT[level]}`} />
              ))}
              {t.more}
            </div>
            <DayDetail day={day} money={money} />
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium">{t.byWeekday}</h3>
              <p className="mt-0.5 text-xs text-muted">{t.byWeekdayIntro}</p>
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
              <h3 className="text-sm font-medium">{t.byHalf}</h3>
              <div aria-hidden className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-background">
                <span className="h-full bg-expense/70" style={{ width: `${halvesTotal > 0 ? (halves.first / halvesTotal) * 100 : 0}%` }} />
                <span className="h-full bg-expense/25" style={{ width: `${halvesTotal > 0 ? (halves.second / halvesTotal) * 100 : 0}%` }} />
              </div>
              <ul className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-xs text-muted">
                <li>{t.firstHalf(formatShare(halves.first, halvesTotal))}</li>
                <li>{t.secondHalf(formatShare(halves.second, halvesTotal))}</li>
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
  const locale = useLocale();
  const t = TEXTS[locale];
  const row = (expense: ExpenseRow) => (
    <li key={expense.id}>
      {/* Al guardar, se vuelve a Egresos, al mes del movimiento (como desde cualquier lista). */}
      <Link
        href={`/movimientos/${expense.id}/editar`}
        className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-surface"
      >
        <span className="min-w-0">
          <span className="sr-only">{t.edit}</span>
          <span className="block truncate">
            <span aria-hidden>{expense.categoryEmoji ?? "•"} </span>
            {expense.description}
          </span>
          <span className="block text-xs text-muted">{expense.categoryName ?? NO_CATEGORIES[locale]}</span>
        </span>
        <span className="shrink-0 whitespace-nowrap tabular-nums text-expense">−{money(expense.amount)}</span>
      </Link>
    </li>
  );
  return (
    <div className="mt-3 rounded-lg bg-background p-3 text-sm">
      {!day ? (
        <p className="text-muted">{t.pick}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h4 className="font-medium">{day.title}</h4>
            {day.total > 0 && <span className="whitespace-nowrap font-semibold tabular-nums text-expense">−{money(day.total)}</span>}
          </div>
          <p className="text-xs text-muted">{day.total > 0 ? t.count(day.count) : t.nothing}</p>
          {day.expenses.length > 0 && <ul className="mt-1 divide-y divide-border">{day.expenses.slice(0, DAY_SHOWN).map(row)}</ul>}
          {/* Un día con muchos: los demás, como en "Los gastos más grandes" (cerrados de nuevo en cada día). */}
          {day.expenses.length > DAY_SHOWN && (
            <details key={day.date}>
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand pointer-fine:min-h-8">
                {t.seeMore(day.expenses.length - DAY_SHOWN)}
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
