// Lo que el bot de WhatsApp sabe hacer, en un solo lugar: lo usan su respuesta a "ayuda"
// (src/modules/bot/replies.ts) y la página Ayuda de la web (src/app/[lang]/(app)/ayuda/help-content.tsx). Si cambia
// un comando, cambia en los dos. Cada idioma muestra sus comandos y sus ejemplos, aunque el bot entiende los
// comandos de los dos (src/modules/bot/commands.ts).
import { texts } from "@/i18n/texts";

/** Ejemplos de mensajes que el bot entiende (texto libre, con Claude). Los montos, como en Colombia: van en pesos. */
export const BOT_EXAMPLES = texts<readonly string[]>(
  ["me compré unos zapatos de $500.000", "almuerzo 25 mil y taxi 12 mil", "me pagaron la quincena 2.100.000"],
  { en: ["I bought some shoes for $500.000", "lunch 25k and taxi 12k", "I got paid 2.100.000"] },
);

/** Un comando fijo (sin Claude): lo que se escribe y lo que hace. */
export type BotCommandHelp = {
  command: string;
  description: string;
  /** Otra forma de pedirlo ("balance mes pasado"). */
  alternative?: string;
  /** Una variante, con lo que hace ("reporte 2025", un año). */
  also?: { command: string; description: string };
};

/** Los comandos fijos. */
export const BOT_COMMANDS = texts<readonly BotCommandHelp[]>(
  [
    { command: "balance", description: "cómo vas este mes" },
    { command: "balance septiembre", alternative: "balance mes pasado", description: "otro mes" },
    { command: "reporte", description: "tus últimos 12 meses", also: { command: "reporte 2025", description: "un año" } },
    { command: "deshacer", description: "borra lo último que registré" },
  ],
  {
    en: [
      { command: "balance", description: "how you're doing this month" },
      { command: "balance september", alternative: "balance last month", description: "another month" },
      { command: "report", description: "your last 12 months", also: { command: "report 2025", description: "a year" } },
      { command: "undo", description: "deletes the last thing I added" },
    ],
  },
);

/** "ayuda" va aparte: su respuesta es la lista de arriba. */
export const HELP_COMMAND = texts<BotCommandHelp>(
  { command: "ayuda", description: "te recuerda todo esto" },
  { en: { command: "help", description: "reminds you of all this" } },
);

/** La palabra con la que se vincula el número ("VINCULAR 123456"): el bot entiende las dos. */
export const LINK_WORD = texts("VINCULAR", { en: "LINK" });
