import Link from "next/link";
import { deleteTransactionAction } from "@/modules/transactions/actions";
import type { TransactionRow } from "@/modules/transactions/queries";
import { formatShortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

// Editar y eliminar en cada fila.
const ROW_BUTTON =
  "inline-flex size-11 items-center justify-center rounded-md text-muted transition pointer-fine:size-7";

export function TransactionList({
  items,
  emptyMessage,
  allowDelete = false,
}: {
  items: TransactionRow[];
  emptyMessage: string;
  allowDelete?: boolean;
}) {
  if (items.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((t) => {
        const isIncome = t.type === "income";
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3">
            {/* --chip: en modo oscuro, un tono más clara que la tarjeta (los emojis oscuros se ven). */}
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chip text-base">
              {t.categoryEmoji ?? "•"}
            </span>
            {/* En celular, dos renglones: la descripción con el monto y, abajo, la fecha y la categoría
                con los botones (así la descripción no se aplasta con un monto largo). Desde sm, el
                monto y los botones van a la derecha, en un solo renglón. */}
            <div
              className={`grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 ${allowDelete ? "sm:grid-cols-[minmax(0,1fr)_auto_auto]" : ""}`}
            >
              <p className="truncate text-sm font-medium">{t.description}</p>
              <span
                className={`col-start-2 row-start-1 whitespace-nowrap text-right text-sm font-semibold tabular-nums sm:row-span-2 ${isIncome ? "text-income" : "text-expense"}`}
              >
                {isIncome ? "+" : "−"}
                {formatMoney(t.amount, t.currency)}
              </span>
              <p className={`truncate text-xs text-muted ${allowDelete ? "" : "col-span-2 sm:col-span-1"}`}>
                {formatShortDate(t.occurredOn)} · {t.categoryName ?? "Sin categoría"}
                {t.source === "whatsapp" && " · vía WhatsApp"}
              </p>
              {allowDelete && (
                // En pantallas táctiles, botones de 44 px (lo que recomienda Apple); con mouse, 28 px.
                // El margen negativo evita que agranden la fila en celular.
                <div className="-my-2 flex justify-end sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:my-0">
                  <Link
                    href={`/movimientos/${t.id}/editar`}
                    aria-label={`Editar ${t.description}`}
                    title="Editar"
                    className={ROW_BUTTON + " hover:bg-brand/10 hover:text-brand"}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
                    </svg>
                  </Link>
                  <form action={deleteTransactionAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      aria-label={`Eliminar ${t.description}`}
                      title="Eliminar"
                      className={ROW_BUTTON + " hover:bg-expense/10 hover:text-expense"}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </form>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
