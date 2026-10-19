"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney } from "@/lib/money";

/** Un mes del gráfico, con sus textos ya armados en el servidor (así el navegador dibuja lo mismo). */
export type TrendPoint = {
  /** "2026-09". */
  key: string;
  /** "sept": debajo de la barra. */
  short: string;
  /** "2026" debajo del primer mes y de cada enero; null en los demás. */
  year: string | null;
  /** "Septiembre de 2026". */
  name: string;
  /** Su Resumen. */
  href: string;
  income: number;
  expense: number;
  balance: number;
};

/** El alto de una barra, en porcentaje del más alto del gráfico. Un monto chico se ve igual (al menos 2 %). */
const heightOf = (amount: number, top: number) => (amount > 0 ? Math.max((amount / top) * 100, 2) : 0);

/**
 * "Ingresos y egresos por mes" de Reportes: dos barras por mes (los ingresos en verde y los egresos en
 * naranja, los colores de cada uno en toda la app) y, al pasar el mouse o llegar con Tab, el detalle de
 * ese mes debajo. Cada mes es un enlace a su Resumen: el lector de pantalla lee en él todo lo del mes.
 */
export function TrendChart({ points, currency }: { points: TrendPoint[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const money = (n: number) => formatMoney(n, currency);
  const top = Math.max(...points.flatMap((p) => [p.income, p.expense]), 0);
  const detail = (p: TrendPoint) =>
    `${p.name}: ingresos ${money(p.income)}, egresos ${money(p.expense)}, balance ${money(p.balance)}`;
  const shown = active === null ? null : points[active];

  return (
    <div className="mt-4">
      {/* Sin espacio entre meses (lo da el relleno de cada uno): en 320 px, cada mes mide 24 px de ancho,
          lo mínimo para tocarlo (WCAG 2.5.8). */}
      <div className="flex h-40 items-end border-b border-border" onMouseLeave={() => setActive(null)}>
        {points.map((p, i) => (
          <Link
            key={p.key}
            href={p.href}
            aria-label={detail(p)}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className={`flex h-full min-w-0 flex-1 items-end justify-center gap-px rounded-t-md px-0.5 transition-colors sm:gap-0.5 sm:px-1.5 ${active === i ? "bg-background" : ""}`}
          >
            <span aria-hidden className="w-full max-w-4 rounded-t-sm bg-income" style={{ height: `${heightOf(p.income, top)}%` }} />
            <span aria-hidden className="w-full max-w-4 rounded-t-sm bg-expense" style={{ height: `${heightOf(p.expense, top)}%` }} />
          </Link>
        ))}
      </div>
      <div aria-hidden className="flex">
        {points.map((p) => (
          <span key={p.key} className="min-w-0 flex-1 pt-1 text-center text-[0.6875rem] leading-tight text-muted">
            {p.short}
            {p.year && <span className="block">{p.year}</span>}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-income" />
          Ingresos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-expense" />
          Egresos
        </span>
      </div>
      {/* El detalle del mes señalado (el lector de pantalla ya lo leyó en el enlace). Con su alto
          reservado: al aparecer no mueve lo de abajo. */}
      <p aria-hidden className="mt-2 min-h-10 text-sm">
        {shown ? (
          <>
            <span className="font-medium">{shown.name}</span>
            <span className="text-muted">
              {" · "}Ingresos <span className="whitespace-nowrap text-income">{money(shown.income)}</span>
              {" · "}Egresos <span className="whitespace-nowrap text-expense">{money(shown.expense)}</span>
              {" · "}Balance <span className="whitespace-nowrap text-foreground">{money(shown.balance)}</span>
            </span>
          </>
        ) : (
          <span className="text-muted">
            <span className="pointer-fine:hidden">Toca un mes para ver su Resumen.</span>
            <span className="hidden pointer-fine:inline">Pasa el mouse por un mes para ver sus cifras, o haz clic para ver su Resumen.</span>
          </span>
        )}
      </p>
    </div>
  );
}
