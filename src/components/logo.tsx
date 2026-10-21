import { BRAND_MARK, BRAND_NAME } from "@/lib/brand";

// El logo de la app: el ícono (un globo de chat con un ✓) y el nombre. Con los colores de la marca de
// cada tema (--brand y --brand-foreground): en oscuro, el cuadro verde claro y el globo oscuro. El mismo
// dibujo de los íconos de la pestaña y del celular (src/lib/brand-mark.json).

/** Solo el ícono. Decorativo: quien lo usa pone el nombre al lado (o en el aria-label del enlace). */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox={BRAND_MARK.viewBox} className={`shrink-0 ${className}`} aria-hidden focusable="false">
      <rect width="32" height="32" rx={BRAND_MARK.radius} className="fill-brand" />
      <path d={BRAND_MARK.bubble} className="fill-brand-foreground" />
      <path
        d={BRAND_MARK.check}
        fill="none"
        strokeWidth={BRAND_MARK.checkWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-brand"
      />
    </svg>
  );
}

/** El ícono y el nombre ("Anotado"). */
export function Logo({ markClassName, className = "" }: { markClassName?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <LogoMark className={markClassName} />
      {BRAND_NAME}
    </span>
  );
}
