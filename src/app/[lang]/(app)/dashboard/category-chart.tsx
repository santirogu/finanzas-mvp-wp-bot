"use client";

import { useState } from "react";
import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { formatMoney, formatPercent, formatShare } from "@/lib/money";
import { type ChartSlice, donutArcs } from "@/modules/transactions/category-chart";

// Los colores de cada puesto de la paleta (globals.css, --chart-1 a --chart-7 y --chart-rest).
// Escritos completos: Tailwind solo genera las clases que encuentra así en el código.
const STROKES = ["stroke-chart-1", "stroke-chart-2", "stroke-chart-3", "stroke-chart-4", "stroke-chart-5", "stroke-chart-6", "stroke-chart-7"];
const DOTS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6", "bg-chart-7"];
const strokeOf = (slice: ChartSlice) => (slice.kind === "category" ? STROKES[slice.color] : "stroke-chart-rest");
const dotOf = (slice: ChartSlice) => (slice.kind === "category" ? DOTS[slice.color] : "bg-chart-rest");

// La dona: un círculo por tajada, dibujado como un trazo (stroke-dasharray) que empieza arriba.
const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const WIDTH = 22;
// La resaltada, más gruesa solo hacia afuera (su radio crece la mitad de lo que engorda): el hueco del
// centro, donde va el total, no se achica.
const ACTIVE_WIDTH = 26;
const ACTIVE_RADIUS = RADIUS + (ACTIVE_WIDTH - WIDTH) / 2;
// Un espacio entre tajadas, para distinguirlas (sin él, dos colores parecidos se juntan).
const GAP = 1.5;

/**
 * El tamaño de la letra del total (en rem): el de text-sm hasta 13 caracteres ("$1.000.000,00") y, con
 * los más largos, más chica, para que quepa en el hueco de la dona (unos 100 px: cada carácter mide
 * unos 0,54 de la letra). Así, "$100.012.309.982,99" no toca el anillo.
 */
const totalSize = (label: string) => Math.min(0.875, 11.4 / label.length);

const TEXTS = texts(
  { expenses: "Egresos", more: (n: number) => `${n} más` },
  { en: { expenses: "Expenses", more: (n) => `${n} more` } },
);

/**
 * "Egresos por categoría" del Resumen: la dona con el total de egresos al centro y, debajo (o al lado,
 * si hay espacio), la lista con el color, el monto y el porcentaje de cada una. Tocar una categoría,
 * en la lista o en la dona, resalta su tajada. La lista dice todo lo que muestra la dona: el lector de
 * pantalla lee la lista (la dona es decorativa).
 */
export function CategoryChart({ slices, total, currency }: { slices: ChartSlice[]; total: number; currency: string }) {
  const locale = useLocale();
  const t = TEXTS[locale];
  const [active, setActive] = useState<number | null>(null);
  const money = (n: number) => formatMoney(n, currency, locale);
  const toggle = (i: number) => setActive(active === i ? null : i);
  const arcs = donutArcs(slices);
  const totalLabel = money(total);

  return (
    <div className="mt-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-1">
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 160 160" className="size-44 -rotate-90" aria-hidden>
          {slices.map((slice, i) => {
            const { start, size } = arcs[i];
            const length = size * CIRCUMFERENCE;
            const dash = slices.length > 1 ? Math.max(length - GAP, 0.5) : length;
            return (
              <circle
                key={i}
                data-slice={i}
                cx="80"
                cy="80"
                r={active === i ? ACTIVE_RADIUS : RADIUS}
                fill="none"
                strokeWidth={active === i ? ACTIVE_WIDTH : WIDTH}
                pathLength={CIRCUMFERENCE}
                strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                strokeDashoffset={-start * CIRCUMFERENCE}
                onClick={() => toggle(i)}
                className={`cursor-pointer transition-[opacity,stroke-width] motion-reduce:transition-none ${strokeOf(slice)} ${active !== null && active !== i ? "opacity-30" : ""}`}
              />
            );
          })}
        </svg>
        {/* El total, al centro. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted">{t.expenses}</span>
          <span className="whitespace-nowrap font-semibold tabular-nums" style={{ fontSize: `${totalSize(totalLabel)}rem` }}>
            {totalLabel}
          </span>
        </div>
      </div>

      <ul className="space-y-0.5 text-sm">
        {slices.map((slice, i) => {
          const name =
            slice.kind === "category"
              ? `${slice.category.emoji} ${slice.category.name}`
              : slice.categories.length === 1
                ? `${slice.categories[0].emoji} ${slice.categories[0].name}`
                : t.more(slice.categories.length);
          const amount = slice.kind === "category" ? slice.category.total : slice.total;
          return (
            <li key={i}>
              <button
                type="button"
                aria-pressed={active === i}
                onClick={() => toggle(i)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-background pointer-fine:min-h-8 ${active === i ? "bg-background font-medium" : ""} ${slice.kind === "rest" ? "text-muted" : ""}`}
              >
                <span aria-hidden className={`size-2.5 shrink-0 rounded-sm ${dotOf(slice)}`} />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums text-muted">
                  {money(amount)} · {formatPercent(formatShare(amount, total), locale)}
                </span>
              </button>
              {/* Las chicas, una por una, debajo de su tajada gris. */}
              {slice.kind === "rest" && slice.categories.length > 1 && (
                <ul className="pb-1 pl-7 text-xs text-muted">
                  {slice.categories.map((c) => (
                    <li key={c.name} className="flex justify-between gap-2 py-0.5 pr-2">
                      <span className="min-w-0 truncate">
                        {c.emoji} {c.name}
                      </span>
                      <span className="shrink-0 whitespace-nowrap tabular-nums">
                        {money(c.total)} · {formatPercent(formatShare(c.total, total), locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
