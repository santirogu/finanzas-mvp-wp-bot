import type { Locale } from "@/i18n/locales";
import { BOT_COMMAND_NAMES } from "@/modules/bot/help";

const COMMAND = new RegExp(`\\b(${BOT_COMMAND_NAMES.join("|")})\\b`);

/**
 * Un texto que cita los comandos del bot ("balance, reporte, deshacer y ayuda"). Con la app en otro idioma, cada
 * comando va en `lang="es"`: se escriben en español, y así el lector de pantalla los lee con la voz en español
 * (WCAG 3.1.2). En español, el texto tal cual.
 */
export function BotCommandsText({ text, locale }: { text: string; locale: Locale }) {
  if (locale === "es") return text;
  return text.split(COMMAND).map((part, i) =>
    i % 2 ? (
      <span key={i} lang="es">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
