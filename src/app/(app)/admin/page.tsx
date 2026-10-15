import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/session";
import { PageSkeleton } from "../page-skeleton";

export const metadata: Metadata = { title: "Administración" };

export default function AdminPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Admin />
    </Suspense>
  );
}

async function Admin() {
  // Rol de admin y verificación en dos pasos activa (sin ella, lleva a configurarla).
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Solo para administradores</p>
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
      </div>
      <section className="card space-y-1 p-4 text-sm">
        <h2 className="font-semibold">Registro y vinculación de WhatsApp</h2>
        <p className="text-muted">Pronto verás aquí el historial de registro y vinculación de cada cuenta.</p>
      </section>
      <section className="card space-y-1 p-4 text-sm">
        <h2 className="font-semibold">Verificación en dos pasos</h2>
        <p>
          ✓ Activa. <Link href="/admin/verificacion" className="font-medium text-brand">Ver detalles</Link>
        </p>
      </section>
    </div>
  );
}
