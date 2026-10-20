// Lo que el bot de WhatsApp sabe hacer, en un solo lugar: lo usan su respuesta a "ayuda"
// (src/modules/bot/replies.ts) y la página Ayuda de la web (src/app/[lang]/(app)/ayuda/page.tsx). Si cambia un
// comando, cambia en los dos.

/** Ejemplos de mensajes que el bot entiende (texto libre, con Claude). */
export const BOT_EXAMPLES = ["me compré unos zapatos de $500.000", "almuerzo 25 mil y taxi 12 mil", "me pagaron la quincena 2.100.000"] as const;

/** Los comandos fijos (sin Claude): lo que se escribe y lo que hace. */
export const BOT_COMMANDS = [
  { command: "balance", description: "cómo vas este mes" },
  { command: "balance septiembre", alternative: "balance mes pasado", description: "otro mes" },
  { command: "reporte", description: "tus últimos 12 meses", note: "o *reporte 2025*, un año" },
  { command: "deshacer", description: "borra el último registro" },
] as const;
