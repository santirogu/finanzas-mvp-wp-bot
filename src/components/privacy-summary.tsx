"use client";

import { useLocale } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { DATA_CONTROLLER } from "@/lib/contact";

const { name, city, email, phone } = DATA_CONTROLLER;

// Lo que hay que informar al pedir la autorización (Ley 1581, art. 12): la finalidad, que lo sensible es opcional,
// los derechos y quién es el responsable, con su contacto y su teléfono. Lo completo está en /privacidad.
const TEXTS = texts(
  {
    who: "Quién los trata",
    whoText: `${name}, responsable del tratamiento, en ${city}. Contacto: ${email} o ${phone}.`,
    forWhom: "Para quién es",
    forWhomText: "Solo para mayores de 18 años.",
    what: "Qué datos",
    whatText: "Tu nombre, tu correo, tus ingresos y egresos, tu número de WhatsApp y los mensajes y fotos que le envías al bot.",
    why: "Para qué",
    whyText: "Para llevar tus cuentas, mostrarte tus reportes y avisos, y que el bot registre lo que le escribes.",
    withWhom: "Con quién",
    withWhomText:
      "Con Anthropic (Claude), que lee tus mensajes y fotos para entenderlos; con Meta, por WhatsApp, y con Vercel y Neon, donde funciona la app y se guardan los datos. Los cuatro pueden procesarlos fuera de Colombia, incluido Estados Unidos.",
    sensitive: "Datos sensibles",
    sensitiveText:
      "No los necesitamos y darlos es opcional: no estás obligado a autorizar su tratamiento. Si una factura o un mensaje trae datos de tu salud, por ejemplo, tápalos o no los envíes.",
    rights: "Tus derechos",
    rightsText: `Conocer, actualizar, rectificar y eliminar tus datos; pedir la prueba de esta autorización; saber cómo los usamos; revocarla, y acceder a ellos gratis, escribiendo a ${email}. También puedes quejarte ante la Superintendencia de Industria y Comercio.`,
  },
  {
    en: {
      who: "Who processes it",
      whoText: `${name}, the data controller, in ${city}. Contact: ${email} or ${phone}.`,
      forWhom: "Who it's for",
      forWhomText: "Only people 18 or older.",
      what: "What data",
      whatText: "Your name, your email, your income and expenses, your WhatsApp number and the messages and photos you send to the bot.",
      why: "What for",
      whyText: "To keep track of your money, show you your reports and notices, and let the bot add what you write to it.",
      withWhom: "Who it's shared with",
      withWhomText:
        "Anthropic (Claude), which reads your messages and photos to understand them; Meta, for WhatsApp; and Vercel and Neon, where the app runs and the data is stored. All four may process it outside Colombia, including in the United States.",
      sensitive: "Sensitive data",
      sensitiveText:
        "We don't need it and giving it is optional: you don't have to authorize its processing. If a receipt or a message shows health information, for example, cover it or don't send it.",
      rights: "Your rights",
      rightsText: `To know, update, correct and delete your data; to ask for proof of this authorization; to know how we use it; to revoke it; and to access it for free, by writing to ${email}. You can also complain to the Superintendencia de Industria y Comercio.`,
    },
  },
);

/** Lo que se autoriza, en corto: en /autorizacion y, plegado, bajo la casilla del registro. */
export function PrivacySummary() {
  const t = TEXTS[useLocale()];
  const items = [
    [t.who, t.whoText],
    [t.forWhom, t.forWhomText],
    [t.what, t.whatText],
    [t.why, t.whyText],
    [t.withWhom, t.withWhomText],
    [t.sensitive, t.sensitiveText],
    [t.rights, t.rightsText],
  ];
  return (
    <dl className="space-y-3 text-sm">
      {items.map(([label, text]) => (
        <div key={label}>
          <dt className="font-medium">{label}</dt>
          <dd className="mt-0.5 break-words text-muted">{text}</dd>
        </div>
      ))}
    </dl>
  );
}
