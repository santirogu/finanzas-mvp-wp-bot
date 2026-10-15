import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada" };

// Para direcciones que no existen y para notFound() (por ejemplo, un movimiento ajeno). "/" lleva
// al dashboard si hay sesión y a la portada si no (src/proxy.ts), así que sirve en los dos casos.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium text-brand">Error 404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="mt-3 text-muted">
        Puede que el enlace esté mal escrito o que lo que buscabas ya no exista.
      </p>
      <div className="mt-8 flex justify-center">
        <Link href="/" className="btn-primary">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
