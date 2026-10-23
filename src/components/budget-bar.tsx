import type { BudgetRow } from "@/modules/budgets/progress";

/**
 * Un presupuesto: la categoría, el porcentaje, la barra y cuánto queda o por cuánto se pasó (en rojo, como las
 * alertas). La barra es de apoyo: el texto ya lo dice. La usan la tarjeta del Resumen y Configuración.
 */
export function BudgetBar({ row }: { row: BudgetRow }) {
  const over = row.level === "over";
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p className="min-w-0 truncate font-medium">
          <span aria-hidden>{row.emoji} </span>
          {row.name}
        </p>
        <p className={`shrink-0 text-xs font-medium tabular-nums ${over ? "text-danger" : "text-muted"}`}>{row.share}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-chip" aria-hidden>
        <div className={`h-full rounded-full ${over ? "bg-danger" : "bg-brand"}`} style={{ width: `${row.bar}%` }} />
      </div>
      <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
        <span className="tabular-nums">{row.spentOf}</span>
        <span className={over ? "font-medium text-danger" : row.level === "near" ? "font-medium text-foreground" : ""}>{row.note}</span>
      </p>
      {row.archived && <p className="text-xs text-muted">{row.archived}</p>}
    </div>
  );
}
