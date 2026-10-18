import { requireUser } from "@/lib/session";
import { getLinkForUser } from "@/modules/whatsapp/link";
import { maskPhone } from "@/modules/whatsapp/phone";
import { UnlinkWhatsApp } from "./unlink-whatsapp";
import { WhatsAppConnect } from "./whatsapp-connect";
import { envVar } from "@/lib/env";

export async function WhatsAppCard() {
  const user = await requireUser();
  const link = await getLinkForUser(user.id);

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">WhatsApp</h2>
        {link && (
          <span className="rounded-full bg-income/10 px-2 py-0.5 text-xs font-medium text-income">
            Conectado
          </span>
        )}
      </div>

      {link ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">
            Registra movimientos escribiendo desde{" "}
            <span className="whitespace-nowrap font-medium text-foreground">{maskPhone(link.phone)}</span>. Prueba:{" "}
            <em>“gasté 20 mil en almuerzo”</em>.
          </p>
          <UnlinkWhatsApp />
        </div>
      ) : (
        <WhatsAppConnect
          botNumber={envVar("WHATSAPP_DISPLAY_NUMBER")?.replace(/\D/g, "") || null}
          showSimulator={process.env.NODE_ENV !== "production"}
        />
      )}
    </section>
  );
}
