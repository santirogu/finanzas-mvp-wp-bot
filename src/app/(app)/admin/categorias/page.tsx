import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/session";
import { listAdminCategories, listCategoryChanges, type CategoryChange } from "@/modules/admin/categories/categories";
import {
  CATEGORIES_PATH,
  CATEGORY_TYPES,
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPE_PARAMS,
  changeSentence,
  parseCategoryType,
} from "@/modules/admin/categories/category-input";
import { formatDateTime } from "@/modules/admin/shared/filters";
import { PageSkeleton } from "../../page-skeleton";
import { CategoryManager } from "./category-manager";

export const metadata: Metadata = { title: "Categorías · Administración" };

// La pestaña (egresos o ingresos) viene en la URL: se lee en cada request, dentro de Suspense.
export default function CategoriesPage({ searchParams }: PageProps<"/admin/categorias">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      {searchParams.then((params) => (
        <Categories params={params} />
      ))}
    </Suspense>
  );
}

async function Categories({ params }: { params: Record<string, string | string[] | undefined> }) {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();
  const type = parseCategoryType(params.tipo);
  const [categories, changes] = await Promise.all([listAdminCategories(), listCategoryChanges()]);

  return (
    <div className="space-y-4">
      <section className="card space-y-4 p-4" aria-labelledby="categorias">
        <div className="space-y-1">
          <h2 id="categorias" className="font-semibold">
            Categorías
          </h2>
          <p className="text-sm text-muted">Las de ingresos y egresos de todas las cuentas.</p>
        </div>
        <nav aria-label="Tipo de categoría" className="flex gap-2">
          {CATEGORY_TYPES.map((tab) => {
            const total = categories.filter((c) => c.type === tab && !c.archived).length;
            const current = tab === type;
            return (
              <Link
                key={tab}
                href={tab === "expense" ? CATEGORIES_PATH : `${CATEGORIES_PATH}?tipo=${CATEGORY_TYPE_PARAMS[tab]}`}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  current ? "border-brand/50 bg-brand/10 font-medium text-foreground" : "border-border text-muted hover:text-foreground"
                }`}
              >
                {CATEGORY_TYPE_LABELS[tab]} · {total}
              </Link>
            );
          })}
        </nav>
        {/* key: al cambiar de pestaña, empieza de nuevo (sin ventanas ni avisos de la otra). */}
        <CategoryManager key={type} type={type} categories={categories.filter((c) => c.type === type)} />
      </section>
      <ChangeLog changes={changes} />
    </div>
  );
}

function ChangeLog({ changes }: { changes: CategoryChange[] }) {
  return (
    <section className="card space-y-3 p-4" aria-labelledby="cambios">
      <h2 id="cambios" className="font-semibold">
        Cambios recientes
      </h2>
      {changes.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay cambios.</p>
      ) : (
        <ol aria-label="Cambios recientes" className="divide-y divide-border">
          {changes.map((change) => {
            const { text, detail } = changeSentence(change);
            return (
              <li key={change.id} className="flex gap-3 py-3">
                <span className="flex size-8 flex-none items-center justify-center rounded-full bg-admin-surface text-admin" aria-hidden>
                  <ChangeIcon action={change.action} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{text}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[detail, formatDateTime(change.createdAt)].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const ICONS: Record<CategoryChange["action"], string> = {
  created: "M10 4.5v11M4.5 10h11",
  updated: "M4 16l1-4 8-8 3 3-8 8-4 1zM11.5 5.5l3 3",
  archived: "M3.5 4.5h13v3h-13zM4.5 7.5v8h11v-8M8 10.5h4",
  restored: "M5 8.5a5.5 5.5 0 1 1 0 3M5 4.5v4h4",
  deleted: "M4.5 6h11M8 6V4.5h4V6M6 6l.7 10h6.6L14 6M8.5 9v4.5M11.5 9v4.5",
};

function ChangeIcon({ action }: { action: CategoryChange["action"] }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
      <path d={ICONS[action]} />
    </svg>
  );
}
