import type { RemainingView } from "@/modules/reports/remaining";

const AMOUNT_COLORS = { income: "text-income", expense: "text-expense", total: "font-semibold" } as const;

/**
 * "Lo que te queda este mes" (Resumen, solo con el mes en curso): lo libre y cuánto da por día, el avance del mes,
 * de dónde sale (ingresos, egresos y los gastos fijos que faltan) y, desde la primera semana, cómo cerraría el mes.
 */
export function MonthRemaining({ view }: { view: RemainingView }) {
  return (
    <section aria-labelledby="lo-que-te-queda" className="card p-5">
      <h2 id="lo-que-te-queda" className="font-semibold">
        {view.title}
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        <div className="min-w-0">
          <p className="text-sm text-muted">{view.label}</p>
          {/* Como el balance: desde 17 caracteres ("$9.999.999.999,99"), un poco más chico para que quepa en 375 px. */}
          <p
            className={`mt-1 whitespace-nowrap font-semibold tabular-nums ${view.free.length >= 17 ? "text-2xl" : "text-3xl"} ${view.negative ? "text-expense" : ""}`}
          >
            {view.free}
          </p>
          <p className="mt-1 text-sm">{view.note}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-chip" aria-hidden>
            <div className="h-full rounded-full bg-brand" style={{ width: `${view.progress}%` }} />
          </div>
          <p className="mt-1 flex justify-between gap-2 text-xs text-muted">
            <span>{view.dayOf}</span>
            <span>{view.monthShare}</span>
          </p>
        </div>
        <dl className="min-w-0 divide-y divide-border text-sm">
          {view.rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 py-1.5">
              <dt className={row.kind === "total" ? "font-semibold" : "text-muted"}>
                {row.label}
                {row.detail && <span className="block text-xs text-muted">{row.detail}</span>}
              </dt>
              <dd className={`whitespace-nowrap tabular-nums ${AMOUNT_COLORS[row.kind]}`}>{row.amount}</dd>
            </div>
          ))}
        </dl>
      </div>
      {view.projection && <p className="mt-4 rounded-lg bg-background px-3 py-2 text-sm">{view.projection}</p>}
    </section>
  );
}
