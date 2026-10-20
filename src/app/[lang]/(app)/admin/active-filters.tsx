import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";

const TEXTS = texts(
  { active: "Filtros activos", remove: (label: string) => `Quitar filtro: ${label}`, clear: "Quitar todo" },
  { en: { active: "Active filters", remove: (label) => `Remove filter: ${label}`, clear: "Clear all" } },
);

/** Los filtros activos de un listado de administración como etiquetas: la ✕ de cada una lo quita. */
export function ActiveFilters({ items, clearHref, locale }: { items: { label: string; href: string }[]; clearHref: string; locale: Locale }) {
  if (items.length === 0) return null;
  const t = TEXTS[locale];
  return (
    <ul aria-label={t.active} className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <li key={item.href + item.label}>
          <Link
            href={item.href}
            scroll={false}
            aria-label={t.remove(item.label)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-sm hover:bg-brand/20"
          >
            <span className="truncate">{item.label}</span>
            <span aria-hidden>✕</span>
          </Link>
        </li>
      ))}
      <li>
        <Link href={clearHref} scroll={false} className="px-1 text-sm font-medium text-muted hover:text-foreground">
          {t.clear}
        </Link>
      </li>
    </ul>
  );
}
