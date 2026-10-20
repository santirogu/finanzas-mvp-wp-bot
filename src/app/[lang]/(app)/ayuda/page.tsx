import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { requireUser } from "@/lib/session";
import { BOT_COMMANDS, BOT_EXAMPLES } from "@/modules/bot/help";
import { BIGGEST_SHOWN } from "@/modules/reports/biggest";
import { RECURRING_MIN_MONTHS, RECURRING_WINDOW } from "@/modules/reports/recurring";
import { DAYS_AHEAD, MAX_DAYS_AHEAD, MONTHS_BACK, PAYMENTS_FOR_DAY } from "@/modules/reports/upcoming";
import { SEARCH_FROM } from "@/modules/transactions/search";
import { PageSkeleton } from "../page-skeleton";

const TEXTS = texts(
  { title: "Ayuda", intro: "Cómo sacarle provecho a Finanzas. Toca un tema para abrirlo.", topics: "Temas de ayuda" },
  { en: { title: "Help", intro: "How to get the most out of Finanzas. Tap a topic to open it.", topics: "Help topics" } },
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTexts(TEXTS)).title };
}

// La sesión se lee dentro de Suspense (Cache Components), como en las demás páginas.
export default function AyudaPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Help />
    </Suspense>
  );
}

/** Un tema: se abre al tocarlo (así la página no es un muro de texto). */
function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-b border-border last:border-b-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden>
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <div className="space-y-2 px-4 pb-4 text-sm text-muted [&_strong]:font-medium [&_strong]:text-foreground">{children}</div>
    </details>
  );
}

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-medium text-brand underline-offset-2 hover:underline">
    {children}
  </Link>
);

/**
 * Ayuda (desde el menú de la cuenta): cómo usar la app, por temas. Los números (meses, días, cantidades)
 * salen de las mismas constantes que usa la app, y los comandos del bot, de la misma lista que su
 * respuesta a "ayuda" (src/modules/bot/help.ts): si algo cambia, la ayuda cambia con él.
 */
async function Help() {
  await requireUser();
  const locale = await getLocale();
  const t = TEXTS[locale];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.intro}</p>
      </div>
      <section aria-label={t.topics} className="card">
        {locale === "es" ? <SpanishTopics /> : <EnglishTopics />}
      </section>
    </div>
  );
}

/** Los comandos del bot, de la misma lista que su respuesta a "ayuda" (en español: el bot responde en español). */
function BotCommands({ help }: { help: string }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {BOT_COMMANDS.map((c) => (
        <li key={c.command}>
          <strong>{c.command}</strong>
          {"alternative" in c && (
            <>
              {" "}
              o <strong>{c.alternative}</strong>
            </>
          )}{" "}
          — {c.description}
          {"note" in c && ` (${c.note.replaceAll("*", "")})`}
        </li>
      ))}
      <li>
        <strong>ayuda</strong> — {help}
      </li>
    </ul>
  );
}

function BotExamples() {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {BOT_EXAMPLES.map((example) => (
        <li key={example}>
          <em>{example}</em>
        </li>
      ))}
    </ul>
  );
}

function SpanishTopics() {
  return (
    <>
      <Topic title="Registrar ingresos y egresos">
        <p>
          En <A href="/ingresos">Ingresos</A> o <A href="/egresos">Egresos</A>, escribe el monto, la descripción, la categoría y la fecha
          (nunca después de hoy) y toca <strong>Registrar</strong>. Al escribir la descripción te sugerimos las que ya usaste, con su
          categoría.
        </p>
        <p>
          Cada movimiento de la lista se edita con el lápiz y se borra con la papelera. Si lo borraste sin querer, toca{" "}
          <strong>Deshacer</strong> en el aviso que aparece abajo.
        </p>
        <p>
          Para ver otro mes, toca el nombre del mes arriba de la página. Con {SEARCH_FROM} movimientos o más en el mes, la lista trae un
          buscador por descripción o por categoría.
        </p>
      </Topic>

      <Topic title="El bot de WhatsApp">
        <p>
          Conéctalo en <A href="/cuenta">Mi cuenta</A>: toca <strong>Conectar WhatsApp</strong> y envíale al bot el código que te aparece.
        </p>
        <p>Después, escríbele tus ingresos y gastos como se los contarías a alguien:</p>
        <BotExamples />
        <p>También entiende estos comandos:</p>
        <BotCommands help="te recuerda todo esto" />
      </Topic>

      <Topic title="Gastos fijos y avisos de pagos">
        <p>
          Un <strong>gasto fijo</strong> es un egreso con la misma descripción en al menos {RECURRING_MIN_MONTHS} de los últimos{" "}
          {RECURRING_WINDOW} meses (el arriendo, Netflix, el plan del celular). Los ves en <A href="/gastos-fijos">Fijos</A>: puedes
          quitar uno que no lo es, agregar otro a mano y abrir el historial de su valor, con una nota por cada cambio.
        </p>
        <p>
          En el <A href="/dashboard">Resumen</A> y en la campana de arriba te avisamos de los que tocan pronto ({DAYS_AHEAD} días antes, si
          no lo cambias) y de los atrasados, hasta {MONTHS_BACK} meses atrás. La fecha sale del día en que pagaste las últimas{" "}
          {PAYMENTS_FOR_DAY} veces; con menos pagos, dice <strong>aprox.</strong>
        </p>
        <p>
          En cada aviso: <strong>Registrar pago</strong> lo registra con el monto y la fecha que confirmes, y{" "}
          <strong>Este pago ya no aplica</strong> lo oculta solo ese mes. En la campana, <strong>Marcar como leído</strong> lo saca de
          ahí (sigue en el Resumen).
        </p>
        <p>
          En <A href="/cuenta">Mi cuenta → Notificaciones</A> puedes apagar los avisos o elegir con cuántos días de anticipación llegan
          (de 0, el mismo día, a {MAX_DAYS_AHEAD}).
        </p>
      </Topic>

      <Topic title="Reportes y descargas">
        <p>
          En <A href="/reportes">Reportes</A> ves cómo te va en los últimos 12 meses o en un año: tus cifras, los ingresos y egresos de
          cada mes, cuánto suma cada categoría (y cómo le fue el último mes frente a su promedio), tus {BIGGEST_SHOWN} gastos más
          grandes y qué días gastas más. Los gastos fijos no cuentan entre los más grandes ni en los días.
        </p>
        <p>
          Con el botón de descarga, arriba a la derecha, bajas los movimientos del período en <strong>CSV</strong> (para Excel o Google
          Sheets) o el reporte en <strong>PDF</strong> (para guardar o imprimir).
        </p>
      </Topic>

      <Topic title="Tu cuenta y tus datos">
        <p>
          En <A href="/cuenta">Mi cuenta</A> cambias tu contraseña (se cierran tus otras sesiones), conectas o desvinculas WhatsApp,
          configuras las notificaciones y eliges la apariencia (clara, oscura o la de tu dispositivo).
        </p>
        <p>
          También puedes <strong>eliminar tu cuenta</strong>: se borra todo de inmediato y no se puede deshacer. Lo que guardamos y por
          cuánto tiempo está en la <A href="/privacidad">política de privacidad</A>.
        </p>
      </Topic>
    </>
  );
}

function EnglishTopics() {
  return (
    <>
      <Topic title="Adding income and expenses">
        <p>
          In <A href="/ingresos">Income</A> or <A href="/egresos">Expenses</A>, enter the amount, the description, the category and the
          date (never after today) and tap <strong>Add</strong>. As you type the description, we suggest the ones you&apos;ve used, with
          their category.
        </p>
        <p>
          Each transaction in the list is edited with the pencil and deleted with the trash can. If you deleted it by mistake, tap{" "}
          <strong>Undo</strong> in the notice that shows up below.
        </p>
        <p>
          To see another month, tap the month&apos;s name at the top of the page. With {SEARCH_FROM} or more transactions in the month,
          the list has a search box by description or category.
        </p>
      </Topic>

      <Topic title="The WhatsApp bot">
        <p>
          Connect it in <A href="/cuenta">My account</A>: tap <strong>Connect WhatsApp</strong> and send the bot the code you get.
        </p>
        <p>For now the bot answers in Spanish. Write your income and expenses the way you&apos;d tell someone, for example:</p>
        <BotExamples />
        <p>It also understands these commands:</p>
        <BotCommands help="te recuerda todo esto (reminds you of all this)" />
      </Topic>

      <Topic title="Bills and payment notices">
        <p>
          A <strong>bill</strong> is an expense with the same description in at least {RECURRING_MIN_MONTHS} of the last{" "}
          {RECURRING_WINDOW} months (rent, Netflix, your phone plan). You see them in <A href="/gastos-fijos">Bills</A>: you can remove
          one that isn&apos;t, add another one yourself and open the history of its amount, with a note for each change.
        </p>
        <p>
          In the <A href="/dashboard">Overview</A> and in the bell at the top we let you know about the ones coming up ({DAYS_AHEAD} days
          before, unless you change it) and the overdue ones, up to {MONTHS_BACK} months back. The date comes from the day you paid the
          last {PAYMENTS_FOR_DAY} times; with fewer payments, it says <strong>approx.</strong>
        </p>
        <p>
          In each notice: <strong>Add payment</strong> adds it with the amount and date you confirm, and{" "}
          <strong>This payment doesn&apos;t apply</strong> hides it for that month only. In the bell, <strong>Mark as read</strong> removes
          it from there (it stays in the Overview).
        </p>
        <p>
          In <A href="/cuenta">My account → Notifications</A> you can turn the notices off or choose how many days in advance they come
          (from 0, the same day, to {MAX_DAYS_AHEAD}).
        </p>
      </Topic>

      <Topic title="Reports and downloads">
        <p>
          In <A href="/reportes">Reports</A> you see how you&apos;re doing over the last 12 months or a year: your figures, the income and
          expenses of each month, what each category adds up to (and how it did last month compared with its average), your{" "}
          {BIGGEST_SHOWN} biggest expenses and which days you spend the most. Bills don&apos;t count among the biggest or in the days.
        </p>
        <p>
          With the download button, at the top right, you get the period&apos;s transactions as <strong>CSV</strong> (for Excel or Google
          Sheets) or the report as <strong>PDF</strong> (to save or print).
        </p>
      </Topic>

      <Topic title="Your account and your data">
        <p>
          In <A href="/cuenta">My account</A> you change your password (your other sessions are signed out), connect or unlink WhatsApp,
          set up notifications and choose the appearance (light, dark or your device&apos;s).
        </p>
        <p>
          You can also <strong>delete your account</strong>: everything is deleted right away and it can&apos;t be undone. What we keep
          and for how long is in the <A href="/privacidad">privacy policy</A> (in Spanish).
        </p>
      </Topic>
    </>
  );
}
