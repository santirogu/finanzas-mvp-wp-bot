import { connection } from "next/server";
import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { CONTACT_EMAIL } from "@/lib/contact";
import { getSignupMode } from "@/modules/auth/signup-policy";

const TEXTS = texts(
  {
    closed: "Por ahora los registros están cerrados. Si quieres una cuenta, escríbenos a",
    invite: "Por ahora solo se puede crear una cuenta con invitación: usa el correo al que te invitamos. Si no tienes invitación, escríbenos a",
  },
  {
    en: {
      closed: "Sign-ups are closed for now. If you'd like an account, write to us at",
      invite: "For now you can only create an account with an invitation: use the email we invited. If you don't have an invitation, write to us at",
    },
  },
);

/**
 * Aviso en /registro cuando los registros no están abiertos (Configuración del admin): cerrados o solo con
 * invitación, con el correo de contacto. El servidor igual rechaza el registro (src/lib/auth.ts).
 */
export async function SignupNotice() {
  // Se lee en cada pedido, nunca al compilar: el admin los abre o los cierra en cualquier momento.
  await connection();
  const mode = await getSignupMode();
  if (mode === "open") return null;
  const t = await getTexts(TEXTS);
  return (
    <p role="status" className="w-full max-w-sm rounded-lg bg-brand/10 px-3 py-2 text-sm">
      {t[mode]}{" "}
      {/* Del color del texto: el de la marca no da el contraste sobre este fondo. */}
      <a href={`mailto:${CONTACT_EMAIL}`} className="break-all font-medium underline underline-offset-2">
        {CONTACT_EMAIL}
      </a>
      .
    </p>
  );
}
