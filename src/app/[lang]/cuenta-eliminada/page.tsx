import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Cuenta eliminada" };

// Pública: se llega aquí justo después de eliminar la cuenta, ya sin sesión.
export default function AccountDeletedPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Tu cuenta fue eliminada</h1>
      <p className="mt-3 text-muted">
        Borramos tu cuenta, tus movimientos y los mensajes que le enviaste al bot de WhatsApp.
        Gracias por haber usado Finanzas MVP.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="rounded-lg border border-border px-4 py-2 font-medium">
          Ir al inicio
        </Link>
        <Link href="/registro" className="btn-primary">
          Crear una cuenta nueva
        </Link>
      </div>
    </main>
  );
}
