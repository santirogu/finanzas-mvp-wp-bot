import { texts } from "@/i18n/texts";
import { BRAND_NAME } from "@/lib/brand";

/** El nombre de la app (el mismo en todos los idiomas: src/lib/brand.ts) y su descripción. */
export const APP_TEXTS = texts(
  {
    name: BRAND_NAME,
    description: "Escribe tu gasto por WhatsApp y queda anotado. Tus ingresos y egresos, claros en la web.",
    shareImage: `${BRAND_NAME}: escribe tu gasto por WhatsApp y queda anotado. Al mensaje “gasté 25 mil en almuerzo”, el bot responde “Egreso ${BRAND_NAME}: Almuerzo — $25.000,00 (Alimentación)”.`,
  },
  {
    en: {
      name: BRAND_NAME,
      description: "Text your expense on WhatsApp and it's noted. Your income and expenses, clear on the web.",
      shareImage: `${BRAND_NAME}: text your expense on WhatsApp and it's noted. To the message “gasté 25 mil en almuerzo”, the bot answers “Egreso ${BRAND_NAME}: Almuerzo — $25.000,00 (Alimentación)”.`,
    },
  },
);
