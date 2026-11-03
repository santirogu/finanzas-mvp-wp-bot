import Link from "next/link";
import { texts } from "@/i18n/texts";
import type { Locale } from "@/i18n/locales";
import { alertView } from "@/modules/admin/bot/alerts-view";
import type { BotAlert } from "@/modules/bot/alert-rules";

const TEXTS = texts(
  { alerts: "Alertas del bot", notices: "Avisos del bot", seeBot: "Ver Bot de WhatsApp" },
  { en: { alerts: "Bot alerts", notices: "Bot notices", seeBot: "See WhatsApp bot" } },
);

/**
 * Las alertas del bot (src/modules/bot/alerts.ts) arriba del Inicio del admin y de /admin/bot: qué pasa,
 * desde cuándo y qué hacer. En rojo si alguna es una falla; si solo hay avisos (el tope mensual cerca), en
 * el tono de siempre. Sin alertas no se muestra.
 */
export function BotAlerts({ alerts, locale, link = false }: { alerts: readonly BotAlert[]; locale: Locale; link?: boolean }) {
  if (alerts.length === 0) return null;
  const t = TEXTS[locale];
  const views = alerts.map((alert) => alertView(alert, locale));
  const failing = views.some((view) => !view.warning);
  return (
    <section
      aria-labelledby="alertas-del-bot"
      className={failing ? "rounded-xl border border-danger-border bg-danger-surface p-4" : "card p-4"}
    >
      <h2 id="alertas-del-bot" className={`flex items-center gap-2 font-semibold ${failing ? "text-danger" : ""}`}>
        <span aria-hidden>▲</span>
        {failing ? t.alerts : t.notices}
      </h2>
      <ul className="mt-2 space-y-3 text-sm">
        {views.map((view) => (
          <li key={view.title} className="space-y-0.5">
            <p className={`font-medium ${view.warning ? "" : "text-danger"}`}>{view.title}</p>
            {view.detail && <p>{view.detail}</p>}
            <p>{view.action}</p>
          </li>
        ))}
      </ul>
      {link && (
        <Link href="/admin/bot" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand underline pointer-fine:min-h-0">
          {t.seeBot}
        </Link>
      )}
    </section>
  );
}
