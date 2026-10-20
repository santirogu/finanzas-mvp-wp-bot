"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { formatMoney } from "@/lib/money";

const TEXTS = texts(
  {
    income: "Ingresos",
    expenses: "Egresos",
    balance: "Balance",
    detail: (month: string, income: string, expense: string, balance: string) => `${month}: ingresos ${income}, egresos ${expense}, balance ${balance}`,
    touch: "Toca un mes para ver su Resumen.",
    hover: "Pasa el mouse por un mes para ver sus cifras, o haz clic para ver su Resumen.",
  },
  {
    en: {
      income: "Income",
      expenses: "Expenses",
      balance: "Balance",
      detail: (month, income, expense, balance) => `${month}: income ${income}, expenses ${expense}, balance ${balance}`,
      touch: "Tap a month to see its Overview.",
      hover: "Hover over a month to see its figures, or click to see its Overview.",
    },
  },
);

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
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, currency, locale);
  const top = Math.max(...points.flatMap((p) => [p.income, p.expense]), 0);
  const detail = (p: TrendPoint) => TEXTS[locale].detail(p.name, money(p.income), money(p.expense), money(p.balance));
  const shown = active === null ? null : points[active];

  return (
    <div className="mt-4">
      {/* Sin espacio entre meses (lo da el relleno de cada uno) y, en las pantallas más angostas, también
          sobre el margen de la tarjeta y su borde (16 + 1 px): así, en 320 px, cada mes mide 24 px de
          ancho, lo mínimo para tocarlo (WCAG 2.5.8). */}
      <div className="-mx-[1.0625rem] flex h-40 items-end border-b border-border min-[24rem]:mx-0" onMouseLeave={() => setActive(null)}>
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
      {/* En 320 px, "sept" cabe con 10 px de letra y el año, solo corto ("’25"). Desde 640 px, el año completo. */}
      <div aria-hidden className="-mx-[1.0625rem] flex min-[24rem]:mx-0">
        {points.map((p) => (
          <span key={p.key} className="min-w-0 flex-1 pt-1 text-center text-[0.625rem] leading-tight text-muted min-[24rem]:text-[0.6875rem]">
            {p.short}
            {p.year && (
              <>
                <span className="block sm:hidden">’{p.year.slice(2)}</span>
                <span className="hidden sm:block">{p.year}</span>
              </>
            )}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-income" />
          {TEXTS[locale].income}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-expense" />
          {TEXTS[locale].expenses}
        </span>
      </div>
      {/* El detalle del mes señalado (el lector de pantalla ya lo leyó en el enlace). Con su alto
          reservado: al aparecer no mueve lo de abajo. */}
      <p aria-hidden className="mt-2 min-h-10 text-sm">
        {shown ? (
          <>
            <span className="font-medium">{shown.name}</span>
            <span className="text-muted">
              {" · "}
              {TEXTS[locale].income} <span className="whitespace-nowrap text-income">{money(shown.income)}</span>
              {" · "}
              {TEXTS[locale].expenses} <span className="whitespace-nowrap text-expense">{money(shown.expense)}</span>
              {" · "}
              {TEXTS[locale].balance} <span className="whitespace-nowrap text-foreground">{money(shown.balance)}</span>
            </span>
          </>
        ) : (
          <span className="text-muted">
            <span className="pointer-fine:hidden">{TEXTS[locale].touch}</span>
            <span className="hidden pointer-fine:inline">{TEXTS[locale].hover}</span>
          </span>
        )}
      </p>
    </div>
  );
}
