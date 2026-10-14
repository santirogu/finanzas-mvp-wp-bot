import type { Metadata } from "next";
import Link from "next/link";
import {
  CONTACT_EMAIL,
  DataDeletionSteps,
  LEGAL_UPDATED_AT,
  legalProseClass,
} from "../privacidad/legal";

export const metadata: Metadata = {
  title: "Eliminar tus datos",
  description: "Cómo desconectar WhatsApp y eliminar tu cuenta y tus datos de Finanzas MVP.",
};

export default function DataDeletionPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm font-medium text-brand">
        ← Finanzas MVP
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Eliminar tus datos</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {LEGAL_UPDATED_AT}</p>

      <div className={legalProseClass}>
        <section>
          <p>Puedes dejar de usar el bot o borrar toda tu información en cualquier momento:</p>
          <DataDeletionSteps />
        </section>
        <section>
          <h2>Qué se elimina</h2>
          <p>
            Tu cuenta (nombre, correo y contraseña), todos tus ingresos y egresos, el número de
            WhatsApp vinculado y el historial de mensajes enviados al bot.
          </p>
          <p>
            ¿Dudas? Escríbenos a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
              {CONTACT_EMAIL}
            </a>
            . Más detalles en la{" "}
            <Link href="/privacidad" className="text-brand underline">
              política de privacidad
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
