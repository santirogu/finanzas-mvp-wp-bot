import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import {
  CONTACT_EMAIL,
  DataDeletionSteps,
  LEGAL_UPDATED_AT,
  legalProseClass,
} from "../privacidad/legal";
import { SpanishOnlyNote } from "../privacidad/spanish-only";

export const metadata: Metadata = {
  title: "Eliminar tus datos",
  description: `Cómo desvincular tu WhatsApp y eliminar tu cuenta y tus datos de ${BRAND_NAME}.`,
};

export default function DataDeletionPage() {
  return (
    <main lang="es" className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm font-medium text-brand">
        ← {BRAND_NAME}
      </Link>
      <SpanishOnlyNote />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Eliminar tus datos</h1>
      <p className="mt-2 text-sm text-muted">Última actualización: {LEGAL_UPDATED_AT}</p>

      <div className={legalProseClass}>
        <section>
          <p>Puedes dejar de usar el bot o borrar toda tu información en cualquier momento:</p>
          <DataDeletionSteps />
        </section>
        <section>
          <h2>Qué se elimina</h2>
          <ul>
            <li>tu cuenta: nombre, correo y contraseña;</li>
            <li>todos tus ingresos y egresos;</li>
            <li>el número de WhatsApp vinculado;</li>
            <li>el historial de mensajes enviados al bot;</li>
            <li>el historial de registro y vinculación de tu cuenta.</li>
          </ul>
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
