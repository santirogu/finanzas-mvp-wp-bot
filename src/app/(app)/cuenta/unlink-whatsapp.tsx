"use client";

import { useFormStatus } from "react-dom";
import { useToast } from "@/components/toaster";
import { unlinkWhatsAppAction } from "@/modules/whatsapp/actions";

/** "Desvincular número" en la tarjeta de WhatsApp de Mi cuenta: al terminar, el aviso emergente (rojo). */
export function UnlinkWhatsApp() {
  const toast = useToast();
  return (
    <form
      action={async () => {
        await unlinkWhatsAppAction();
        toast({ tone: "removal", message: "Se desvinculó tu WhatsApp", focus: true });
      }}
    >
      <UnlinkButton />
    </form>
  );
}

/** Mientras se envía, dice "Desvinculando…" y no deja tocarlo otra vez (un doble clic daba dos avisos). */
function UnlinkButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-medium text-muted underline underline-offset-2 hover:text-danger disabled:opacity-60"
    >
      {pending ? "Desvinculando…" : "Desvincular número"}
    </button>
  );
}
