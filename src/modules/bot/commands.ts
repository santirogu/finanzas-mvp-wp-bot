// Comandos fijos del bot. Se resuelven con expresiones regulares, sin llamar a la IA:
// son más rápidos, gratis y 100 % predecibles.

export type BotCommand =
  | { kind: "command"; command: "balance" | "undo" | "help" }
  | { kind: "link"; code: string };

const strip = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¿?¡!.]+/g, "")
    .trim();

const BALANCE = /^(mi )?(balance|saldo|resumen)( del mes)?$|^cuanto (llevo|tengo|he gastado)( este mes)?$/;
const UNDO = /^(deshacer|anular|borrar|eliminar)( (el )?ultimo)?$/;
const HELP = /^(ayuda|help|menu|hola|holi|buenas|buenos dias|buenas tardes|buenas noches|comandos)$/;
const LINK = /^vincular\s+(\d{6})$/;

export function parseCommand(text: string): BotCommand | null {
  const normalized = strip(text);
  const link = normalized.match(LINK);
  if (link) return { kind: "link", code: link[1] };
  if (BALANCE.test(normalized)) return { kind: "command", command: "balance" };
  if (UNDO.test(normalized)) return { kind: "command", command: "undo" };
  if (HELP.test(normalized)) return { kind: "command", command: "help" };
  return null;
}
