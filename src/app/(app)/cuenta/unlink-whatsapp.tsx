"use client";

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
      <button type="submit" className="text-xs font-medium text-muted underline underline-offset-2 hover:text-danger">
        Desvincular número
      </button>
    </form>
  );
}
