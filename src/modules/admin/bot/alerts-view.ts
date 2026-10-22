import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";
import { formatPercent } from "@/lib/money";
import { formatDateTime } from "@/modules/admin/shared/filters";
import { isWarning, type BotAlert } from "@/modules/bot/alerts";
import { formatDayMonth } from "./bot-filters";

// Cómo se lee cada alerta del bot (src/modules/bot/alerts.ts): qué pasa, desde cuándo y qué hacer, en el
// idioma de la página. Las variables de entorno se cambian en Vercel y piden un despliegue nuevo para llegar
// a la app (README → Despliegue).

/** Una alerta para leer: `warning`, un aviso (el tope mensual cerca), no una falla. */
export type BotAlertView = { title: string; detail: string | null; action: string; warning: boolean };

const TEXTS = {
  es: {
    since: (date: string) => `Desde el ${date}`,
    unsent: (n: number) => (n === 1 ? "1 respuesta no salió" : `${n} respuestas no salieron`),
    whatsapp_token: {
      title: "El token de WhatsApp no sirve: el bot no puede responder",
      action:
        "Genera uno nuevo en Meta (WhatsApp → API Setup), cámbialo en Vercel (WHATSAPP_ACCESS_TOKEN) y despliega de nuevo (Actions → CI → Run workflow). Después, reenvía las respuestas que no salieron.",
    },
    whatsapp_send: {
      title: "WhatsApp no está enviando las respuestas",
      action: "Revisa la causa en Errores y prueba la conexión en Salud del sistema.",
    },
    claude_key: {
      title: "La API key de Claude no sirve: el bot no entiende lo que se escribe libremente",
      action: "Crea una nueva en la consola de Anthropic, cámbiala en Vercel (ANTHROPIC_API_KEY) y despliega de nuevo.",
    },
    claude_model: {
      title: "El modelo del bot no existe o la API key no tiene acceso a él",
      action: "Cambia BOT_MODEL en Vercel por un modelo vigente (antes, compáralo con pnpm bot:eval) y despliega de nuevo.",
    },
    claude_credits: {
      title: "La cuenta de Anthropic se quedó sin créditos",
      action: "Recarga créditos en la consola de Anthropic (Billing). No hace falta desplegar.",
    },
    claude_config: {
      title: "Falta configurar Claude (ANTHROPIC_API_KEY)",
      action: "Agrégala en Vercel y despliega de nuevo.",
    },
    claude_failing: {
      title: (n: number) => `Claude está fallando: las últimas ${n} llamadas dieron error`,
      action: "Puede ser una caída de Anthropic (status.anthropic.com). Revisa la causa en Errores.",
    },
    monthly_limit: {
      title: (date: string) => `Se alcanzó el tope mensual de tokens: Claude está en pausa hasta el ${date}`,
      action: "Si hace falta antes, sube el tope en Configuración.",
    },
    monthly_limit_near: {
      title: (share: string) => `Ya se usó el ${share} del tope mensual de tokens`,
      action: (date: string) => `Al llegar al tope, Claude se pausa hasta el ${date}. Si hace falta, súbelo en Configuración.`,
    },
    stuck_messages: {
      title: (n: number) => (n === 1 ? "1 mensaje de las últimas 24 horas quedó sin procesar" : `${n} mensajes de las últimas 24 horas quedaron sin procesar`),
      action: "Revisa los logs de Vercel (Logs → Functions) a esas horas.",
    },
  },
  en: {
    since: (date: string) => `Since ${date}`,
    unsent: (n: number) => (n === 1 ? "1 reply didn't go out" : `${n} replies didn't go out`),
    whatsapp_token: {
      title: "The WhatsApp token doesn't work: the bot can't reply",
      action:
        "Generate a new one in Meta (WhatsApp → API Setup), change it in Vercel (WHATSAPP_ACCESS_TOKEN) and deploy again (Actions → CI → Run workflow). Then resend the replies that didn't go out.",
    },
    whatsapp_send: {
      title: "WhatsApp isn't sending the replies",
      action: "Check the cause in Errors and test the connection in System health.",
    },
    claude_key: {
      title: "The Claude API key doesn't work: the bot can't understand freely written messages",
      action: "Create a new one in the Anthropic console, change it in Vercel (ANTHROPIC_API_KEY) and deploy again.",
    },
    claude_model: {
      title: "The bot's model doesn't exist or the API key can't use it",
      action: "Change BOT_MODEL in Vercel to a current model (compare it first with pnpm bot:eval) and deploy again.",
    },
    claude_credits: {
      title: "The Anthropic account ran out of credits",
      action: "Add credits in the Anthropic console (Billing). No need to deploy.",
    },
    claude_config: {
      title: "Claude isn't set up (ANTHROPIC_API_KEY)",
      action: "Add it in Vercel and deploy again.",
    },
    claude_failing: {
      title: (n: number) => `Claude is failing: the last ${n} calls returned an error`,
      action: "It may be an Anthropic outage (status.anthropic.com). Check the cause in Errors.",
    },
    monthly_limit: {
      title: (date: string) => `The monthly token limit was reached: Claude is paused until ${date}`,
      action: "If you need it sooner, raise the limit in Settings.",
    },
    monthly_limit_near: {
      title: (share: string) => `${share} of the monthly token limit is already used`,
      action: (date: string) => `When it reaches the limit, Claude pauses until ${date}. If needed, raise it in Settings.`,
    },
    stuck_messages: {
      title: (n: number) => (n === 1 ? "1 message from the last 24 hours wasn't processed" : `${n} messages from the last 24 hours weren't processed`),
      action: "Check the Vercel logs (Logs → Functions) around those times.",
    },
  },
} as const satisfies Record<Locale, unknown>;

/** Una alerta en el idioma de la página. */
export function alertView(alert: BotAlert, locale: Locale = DEFAULT_LOCALE): BotAlertView {
  const t = TEXTS[locale];
  const view = (title: string, action: string, detail: string | null = null): BotAlertView => ({ title, detail, action, warning: isWarning(alert) });
  const since = (date: Date) => t.since(formatDateTime(date, locale));
  switch (alert.kind) {
    case "whatsapp_token":
    case "whatsapp_send":
      return view(t[alert.kind].title, t[alert.kind].action, `${since(alert.since)} · ${t.unsent(alert.unsent)}`);
    case "claude_key":
    case "claude_model":
    case "claude_credits":
    case "claude_config":
      return view(t[alert.kind].title, t[alert.kind].action, since(alert.since));
    case "claude_failing":
      return view(t.claude_failing.title(alert.failures), t.claude_failing.action, since(alert.since));
    case "monthly_limit":
      return view(t.monthly_limit.title(formatDayMonth(alert.resetsOn, locale)), t.monthly_limit.action);
    case "monthly_limit_near":
      return view(
        t.monthly_limit_near.title(formatPercent(Math.floor(alert.share * 100), locale)),
        t.monthly_limit_near.action(formatDayMonth(alert.resetsOn, locale)),
      );
    case "stuck_messages":
      return view(t.stuck_messages.title(alert.count), t.stuck_messages.action);
  }
}
