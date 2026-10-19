import type { Metadata } from "next";
import { Suspense } from "react";
import { roleLabel } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { PageSkeleton } from "../page-skeleton";
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

      <section className="card space-y-1 p-4 text-sm">
        <h2 className="font-semibold">Tus datos</h2>
        <p>
          <span className="text-muted">Nombre:</span> {user.name}
        </p>
        <p>
          <span className="text-muted">Correo:</span> {user.email}
        </p>
        <p>
          <span className="text-muted">Tipo de cuenta:</span> {roleLabel(user.role, user.superAdmin)}
        </p>
      </section>

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
