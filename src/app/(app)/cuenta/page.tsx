import type { Metadata } from "next";
import { Suspense } from "react";
import { hasRole, roleLabel } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { PageSkeleton } from "../page-skeleton";
import { ChangePassword } from "./change-password";
import { DeleteAccountForm } from "./delete-account-form";
import { ThemePicker } from "./theme-picker";
import { WhatsAppCard } from "./whatsapp-card";

export const metadata: Metadata = { title: "Mi cuenta" };

export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>

      <section className="card p-4 text-sm" aria-labelledby="tus-datos">
        <h2 id="tus-datos" className="font-semibold">
          Tus datos
        </h2>
        <dl className="divide-y divide-border">
          <DataRow label="Nombre">{user.name}</DataRow>
          <DataRow
            label="Correo"
            action={
              // Pronto: cuando la app pueda enviar correos para confirmar el nuevo (sin eso, un correo mal
              // escrito dejaría a la persona sin poder entrar).
              <span className="flex shrink-0 items-center gap-2">
                <Soon />
                <button
                  type="button"
                  disabled
                  title="Pronto: cuando podamos enviarte un correo para confirmarlo"
                  className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 font-medium text-muted disabled:cursor-not-allowed pointer-fine:min-h-9"
                >
                  Cambiar correo
                </button>
              </span>
            }
          >
            <span className="break-all">{user.email}</span>
          </DataRow>
          <DataRow label="Tipo de cuenta">{roleLabel(user.role, user.superAdmin)}</DataRow>
          <DataRow label="Moneda" action={<Soon label="Pronto: USD y EUR" />}>
            {CURRENCY_NAMES[user.currency] ? `${CURRENCY_NAMES[user.currency]} (${user.currency})` : user.currency}
          </DataRow>
        </dl>
      </section>

      {/* Un admin con la verificación en dos pasos confirma también con su código. */}
      <ChangePassword needsCode={hasRole(user.role, "admin") && user.twoFactorEnabled} />

      <WhatsAppCard />

      <section className="card space-y-3 p-4 text-sm" aria-labelledby="apariencia">
        <div className="space-y-1">
          <h2 id="apariencia" className="font-semibold">
            Apariencia
          </h2>
          <p className="text-muted">
            Con &quot;Sistema&quot;, la app se ve clara u oscura según tu celular o computador. Se guarda en
            este dispositivo.
          </p>
        </div>
        <ThemePicker />
      </section>

      <section className="card space-y-4 border-danger/40 p-4">
        <div className="space-y-2 text-sm">
          <h2 className="font-semibold text-danger">Eliminar mi cuenta</h2>
          <p>Se borra todo de inmediato y no se puede deshacer:</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>tu cuenta y tu sesión;</li>
            <li>todos tus ingresos, egresos y categorías;</li>
            <li>el vínculo con tu WhatsApp y los mensajes que le enviaste al bot.</li>
          </ul>
        </div>
        <DeleteAccountForm />
      </section>
    </div>
  );
}

/** El nombre de cada moneda (por ahora, todas las cuentas son en pesos). */
const CURRENCY_NAMES: Record<string, string> = { COP: "Peso colombiano" };

/** Una fila de "Tus datos": el nombre del dato, su valor y, a la derecha, lo que se puede hacer con él. */
function DataRow({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  // dt y dd van directo en su div (lo exige el <dl>): la acción, dentro del dd, junto al valor.
  return (
    <div className="py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="min-w-0">{children}</span>
        {action}
      </dd>
    </div>
  );
}

/** Lo que viene ("Pronto"), como en los módulos de la administración. */
function Soon({ label = "Pronto" }: { label?: string }) {
  return <span className="whitespace-nowrap rounded-full border border-border px-2 text-xs text-muted">{label}</span>;
}
