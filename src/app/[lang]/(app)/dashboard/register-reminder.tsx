import Link from "next/link";
import { getLocale } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { envVar } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { reminderText } from "@/modules/reminders/register-reminder";
import { getRegisterReminder } from "@/modules/reminders/reminders";
import { getLinkForUser } from "@/modules/whatsapp/link";

const TEXTS = texts({ register: "Registrar un egreso", bot: "Escribirle al bot" }, { en: { register: "Add an expense", bot: "Message the bot" } });

/**
 * En el Resumen (con el mes en curso), si la persona lleva varios días sin registrar nada: el recordatorio de
 * registro (src/modules/reminders/), con el enlace para registrar un egreso y, con el WhatsApp vinculado, para
 * escribirle al bot. Se apaga o se cambian los días en Configuración. `today`: YYYY-MM-DD en su zona.
 */
export async function RegisterReminderCard({ today }: { today: string }) {
  const user = await requireUser();
  const [reminder, link, locale] = await Promise.all([getRegisterReminder(user.id, user.timezone, today), getLinkForUser(user.id), getLocale()]);
  if (!reminder) return null;
  const t = TEXTS[locale];
  const text = reminderText(reminder, locale);
  const botNumber = link ? envVar("WHATSAPP_DISPLAY_NUMBER")?.replace(/\D/g, "") : null;

  return (
    <section aria-labelledby="recordatorio-de-registro" className="card flex items-start gap-3 p-4">
      {/* Un lápiz (decorativo: el texto lo dice). */}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="mt-0.5 size-6 shrink-0 text-brand" aria-hidden>
        <path d="M4 16l1-4 8-8 3 3-8 8-4 1zM11.5 5.5l3 3" />
      </svg>
      <div className="min-w-0 flex-1">
        <h2 id="recordatorio-de-registro" className="text-sm font-medium">
          {text.title}
        </h2>
        <p className="text-sm text-muted">{text.hint}</p>
        <div className="flex flex-wrap gap-x-4">
          <Link href="/egresos" className="inline-flex min-h-11 items-center text-sm font-medium text-brand pointer-fine:min-h-8">
            {t.register} <span aria-hidden>&nbsp;→</span>
          </Link>
          {botNumber && (
            <a
              href={`https://wa.me/${botNumber}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center text-sm font-medium text-brand pointer-fine:min-h-8"
            >
              {t.bot}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
