// Las flechas de una comparación: arriba, abajo o igual (el texto ya lo dice; son solo de apoyo).
const ICONS = {
  up: "M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06Z",
  down: "M6.28 5.22a.75.75 0 0 0-1.06 1.06l7.22 7.22H6.75a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-1.5 0v5.69L6.28 5.22Z",
  same: "M4 7.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 7.25Zm0 5.5a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1-.75-.75Z",
} as const;

export type Change = { direction: keyof typeof ICONS; text: string };

/** La flecha sola (decorativa): para usarla dentro de otro elemento, como un botón. */
export function ChangeIcon({ direction }: { direction: Change["direction"] }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0" aria-hidden>
      <path fillRule="evenodd" d={ICONS[direction]} clipRule="evenodd" />
    </svg>
  );
}

/**
 * "↗ 15% más que agosto": la comparación debajo de un monto (las tarjetas del Resumen, las categorías
 * de Reportes).
 */
export function ChangeLine({ change }: { change: Change }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-muted">
      <ChangeIcon direction={change.direction} />
      <span className="min-w-0">{change.text}</span>
    </p>
  );
}
