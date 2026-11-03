// Contenido legal compartido entre /privacidad y /eliminar-datos.

import { CONTACT_EMAIL } from "@/lib/contact";
import { CONFIRMATION_WORD } from "@/modules/account/confirmation";

export { CONTACT_EMAIL };
export const LEGAL_UPDATED_AT = "28 de octubre de 2026";

export const legalProseClass =
  "mt-8 space-y-8 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5";

// Los pasos nombran los botones como en Mi cuenta (whatsapp-card.tsx, delete-account-form.tsx).
export function DataDeletionSteps() {
  return (
    <ul>
      <li>
        <strong>Desvincular tu WhatsApp:</strong> en <strong>Mi cuenta</strong>, en la tarjeta de WhatsApp, toca{" "}
        <strong>Desvincular número</strong>. El bot deja de asociar tus mensajes a tu cuenta.
      </li>
      <li>
        <strong>Eliminar tu cuenta y todos tus datos:</strong> entra a la app y ve a{" "}
        <strong>Mi cuenta → Eliminar mi cuenta</strong>. Escribe tu contraseña y la palabra {CONFIRMATION_WORD}, y
        toca <strong>Eliminar mi cuenta para siempre</strong>. Se borran de inmediato tu cuenta, tus movimientos, el
        vínculo con tu WhatsApp y los mensajes que le enviaste al bot.
      </li>
      <li>
        <strong>Si no puedes entrar a tu cuenta:</strong> envía un correo a{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Eliminar%20mi%20cuenta`}
          className="text-brand underline"
        >
          {CONTACT_EMAIL}
        </a>{" "}
        desde el correo con el que te registraste, con el asunto “Eliminar mi cuenta”. Borraremos
        todo en un plazo máximo de 30 días y te confirmaremos por correo.
      </li>
    </ul>
  );
}
