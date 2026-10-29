import { getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { requireUser } from "@/lib/session";
import { getLinkForUser } from "@/modules/whatsapp/link";
import { maskPhone } from "@/modules/whatsapp/phone";
import { UnlinkWhatsApp } from "./unlink-whatsapp";
import { WhatsAppConnect } from "./whatsapp-connect";
import { envVar } from "@/lib/env";

const TEXTS = texts(
  { connected: "Conectado", linked: "Registra movimientos escribiendo desde", tryIt: "Prueba:", example: "“gasté 20 mil en almuerzo”" },
  { en: { connected: "Connected", linked: "Add transactions by writing from", tryIt: "Try:", example: "“spent 20k on lunch”" } },
);

/**
 * El WhatsApp de la cuenta, en Mi cuenta: conectarlo (el código para enviarle al bot) o, ya vinculado,
 * el número y "Desvincular número". El Resumen lleva aquí (#whatsapp) mientras no esté vinculado.
 */
export async function WhatsAppCard() {
  const user = await requireUser();
  const link = await getLinkForUser(user.id);
  const t = await getTexts(TEXTS);

  return (
    <section id="whatsapp" className="card scroll-mt-4 p-4" aria-labelledby="whatsapp-titulo">
      <div className="flex items-center justify-between gap-2">
        <h2 id="whatsapp-titulo" className="font-semibold">
          WhatsApp
        </h2>
        {link && (
          <span className="rounded-full bg-income/10 px-2 py-0.5 text-xs font-medium text-income">
            {t.connected}
          </span>
        )}
      </div>

      {link ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">
            {/* El número no se corta con espacios que no se parten, no con white-space: nowrap: Safari mide de menos
                ese texto y, entre 428 y 442 px (los iPhone Pro Max), lo dejaba salirse de la tarjeta. */}
            {t.linked} <span className="font-medium text-foreground">{maskPhone(link.phone).replaceAll(" ", " ")}</span>. {t.tryIt}{" "}
            <em>{t.example}</em>.
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
