// Contenido legal compartido entre /privacidad y /eliminar-datos.

export const CONTACT_EMAIL = "santiagorock000@gmail.com";
export const LEGAL_UPDATED_AT = "15 de octubre de 2026";

export const legalProseClass =
  "mt-8 space-y-8 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5";

export function DataDeletionSteps() {
  return (
    <ul>
      <li>
        <strong>Desconectar WhatsApp:</strong> en el dashboard, tarjeta WhatsApp → “Desvincular
        número”. El bot deja de asociar tus mensajes a tu cuenta.
      </li>
      <li>
        <strong>Eliminar tu cuenta y todos tus datos:</strong> entra a la app, toca{" "}
        <strong>Mi cuenta</strong> → “Eliminar mi cuenta” y confirma con tu contraseña. Se borran
        de inmediato tu cuenta, tus movimientos, el vínculo con tu WhatsApp y los mensajes que le
        enviaste al bot.
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
