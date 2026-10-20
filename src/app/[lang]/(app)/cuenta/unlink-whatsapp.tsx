"use client";

import { useFormStatus } from "react-dom";
import { useToast } from "@/components/toaster";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { unlinkWhatsAppAction } from "@/modules/whatsapp/actions";

const TEXTS = texts(
  { done: "Se desvinculó tu WhatsApp", unlinking: "Desvinculando…", unlink: "Desvincular número" },
  { en: { done: "Your WhatsApp was unlinked", unlinking: "Unlinking…", unlink: "Unlink number" } },
);

/** "Desvincular número" en la tarjeta de WhatsApp de Mi cuenta: al terminar, el aviso emergente (rojo). */
export function UnlinkWhatsApp() {
  const t = useTexts(TEXTS);
  const toast = useToast();
  return (
    <form
      action={async () => {
        await unlinkWhatsAppAction();
        toast({ tone: "removal", message: t.done, focus: true });
      }}
    >
      <UnlinkButton />
    </form>
  );
}

/** Mientras se envía, dice "Desvinculando…" y no deja tocarlo otra vez (un doble clic daba dos avisos). */
function UnlinkButton() {
  const t = useTexts(TEXTS);
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-medium text-muted underline underline-offset-2 hover:text-danger disabled:opacity-60"
    >
      {pending ? t.unlinking : t.unlink}
    </button>
  );
}
