// Lo que el bot de WhatsApp sabe hacer, en un solo lugar: lo usan su respuesta a "ayuda"
// (src/modules/bot/replies.ts) y la página Ayuda de la web (src/app/[lang]/(app)/ayuda/page.tsx). Si cambia un
// comando, cambia en los dos. Los comandos y los ejemplos van en español también con la app en inglés (el bot
// responde en español); su explicación, en el idioma de la página.

/** Ejemplos de mensajes que el bot entiende (texto libre, con Claude). */
export const BOT_EXAMPLES = ["me compré unos zapatos de $500.000", "almuerzo 25 mil y taxi 12 mil", "me pagaron la quincena 2.100.000"] as const;

/** Los comandos fijos (sin Claude): lo que se escribe y lo que hace. */
export const BOT_COMMANDS = [
  { command: "balance", description: { es: "cómo vas este mes", en: "how you're doing this month" } },
  { command: "balance septiembre", alternative: "balance mes pasado", description: { es: "otro mes", en: "another month" } },
  {
    command: "reporte",
    description: { es: "tus últimos 12 meses", en: "your last 12 months" },
    also: { command: "reporte 2025", description: { es: "un año", en: "a year" } },
  },
  { command: "deshacer", description: { es: "borra lo último que registré", en: "deletes the last thing I added" } },
] as const;

/** "ayuda" va aparte: su respuesta es la lista de arriba. */
export const HELP_COMMAND = { command: "ayuda", description: { es: "te recuerda todo esto", en: "reminds you of all this" } } as const;

/** Los nombres de los comandos, para los textos que los citan ("balance, reporte, deshacer y ayuda"). */
export const BOT_COMMAND_NAMES = ["balance", "reporte", "deshacer", "ayuda"] as const;
