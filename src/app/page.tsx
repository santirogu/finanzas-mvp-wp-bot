import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-brand">Finanzas MVP</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        Tus finanzas, tan fácil como mandar un WhatsApp.
      </h1>
      <p className="mt-4 text-lg text-muted">
        Escribe “me compré unos zapatos de $500.000” y queda registrado. Revisa tu balance del mes
        cuando quieras.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/registro" className="btn-primary">
          Crear cuenta
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  );
}
