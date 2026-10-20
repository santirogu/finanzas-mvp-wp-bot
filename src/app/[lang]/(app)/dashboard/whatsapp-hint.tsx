import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getLinkForUser } from "@/modules/whatsapp/link";

/** Donde se conecta y se desvincula el WhatsApp (src/app/[lang]/(app)/cuenta/whatsapp-card.tsx). */
export const WHATSAPP_SECTION_HREF = "/cuenta#whatsapp";

/**
 * En el Resumen, mientras la cuenta no tiene el WhatsApp vinculado: un aviso corto que lleva a Mi
 * cuenta, donde se conecta (sin él, una cuenta nueva difícilmente descubriría el bot). Ya vinculado,
 * no muestra nada.
 */
export async function WhatsAppHint() {
  const user = await requireUser();
  if (await getLinkForUser(user.id)) return null;

  return (
    <Link href={WHATSAPP_SECTION_HREF} className="card flex items-center gap-3 p-4 transition hover:border-brand/40">
      {/* Un globo de chat (decorativo: el texto ya dice WhatsApp). */}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="size-6 shrink-0 text-brand" aria-hidden>
        <path d="M10 3.5c-3.9 0-7 2.6-7 5.9 0 1.6.8 3.1 2 4.1L4.5 16.5l3.2-1.4c.7.2 1.5.3 2.3.3 3.9 0 7-2.6 7-5.9S13.9 3.5 10 3.5Z" />
        <path d="M7 9.5h.01M10 9.5h.01M13 9.5h.01" strokeLinecap="round" strokeWidth="2" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Registra tus gastos por WhatsApp</span>
        <span className="block text-sm text-muted">Conecta tu número en Mi cuenta.</span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-sm font-medium text-brand">
        Conectar <span aria-hidden>→</span>
      </span>
    </Link>
  );
}
