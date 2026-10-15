import Link from "next/link";

/** Los filtros activos de un listado de administración como etiquetas: la ✕ de cada una lo quita. */
export function ActiveFilters({ items, clearHref }: { items: { label: string; href: string }[]; clearHref: string }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Filtros activos" className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <li key={item.href + item.label}>
          <Link
            href={item.href}
            scroll={false}
            aria-label={`Quitar filtro: ${item.label}`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-sm hover:bg-brand/20"
          >
            <span className="truncate">{item.label}</span>
            <span aria-hidden>✕</span>
          </Link>
        </li>
      ))}
      <li>
        <Link href={clearHref} scroll={false} className="px-1 text-sm font-medium text-muted hover:text-foreground">
          Quitar todo
        </Link>
      </li>
    </ul>
  );
}
