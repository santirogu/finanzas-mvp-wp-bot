import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { texts } from "@/i18n/texts";
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL } from "@/lib/contact";
import { formatMoney, formatPercent } from "@/lib/money";
import type { AppValues } from "@/modules/app-values/values";
import { BOT_COMMANDS, BOT_EXAMPLES, HELP_COMMAND, LINK_WORD } from "@/modules/bot/help";
import { MAX_TRANSACTIONS_PER_MESSAGE } from "@/modules/bot/limits";
import { PHOTO_MAX_DAYS_BACK } from "@/modules/bot/photo";
import { BIGGEST_SHOWN } from "@/modules/reports/biggest";
import { FACT_MIN_AMOUNT, FACT_MIN_SHARE } from "@/modules/reports/month-fact";
import { PROJECTION_FROM_DAY } from "@/modules/reports/remaining";
import { daysAheadPhrase, MAX_DAYS_AHEAD, MONTHS_BACK, PAYMENTS_FOR_DAY } from "@/modules/reports/upcoming";
import { REMINDER_DAYS, REMINDER_DAYS_MAX, REMINDER_DAYS_MIN } from "@/modules/reminders/register-reminder";
import { SEARCH_FROM } from "@/modules/transactions/search";
import { ALWAYS_PUBLIC } from "@/proxy";

// Lo que dice la Ayuda, con sesión (./page.tsx) y sin ella (src/app/[lang]/ayuda-publica/): los mismos temas y
// preguntas frecuentes en la misma dirección, /ayuda (src/proxy.ts).

export const HELP_TEXTS = texts(
  { title: "Ayuda", intro: `Cómo sacarle provecho a ${BRAND_NAME}. Toca un tema para abrirlo.`, topics: "Temas de ayuda", faq: "Preguntas frecuentes" },
  { en: { title: "Help", intro: `How to get the most out of ${BRAND_NAME}. Tap a topic to open it.`, topics: "Help topics", faq: "Frequently asked questions" } },
);

/** Cómo se nombra una página de la app en el texto: un enlace o, sin sesión, solo su nombre. */
type PageLink = (props: { href: string; children: ReactNode }) => ReactNode;

const LinkTo: PageLink = ({ href, children }) => (
  <Link href={href} className="font-medium text-brand underline-offset-2 hover:underline">
    {children}
  </Link>
);

// Sin sesión, las páginas de la app (Mi cuenta, Fijos…) van en negrita: su enlace llevaría al login. Las que se ven
// sin sesión (la política de privacidad), con su enlace.
const NameOf: PageLink = ({ href, children }) =>
  ALWAYS_PUBLIC.includes(href) ? <LinkTo href={href}>{children}</LinkTo> : <strong>{children}</strong>;

/**
 * La Ayuda: cómo usar la app, por temas, y las preguntas frecuentes. Los números (meses, días, cantidades) salen
 * de las mismas constantes que usa la app, y los comandos del bot, de la misma lista que su respuesta a "ayuda"
 * (src/modules/bot/help.ts): si algo cambia, la ayuda cambia con él. `values`: los avisos por defecto y los
 * umbrales que eligió el admin (Valores de la app). `tutorial`: el botón del tutorial de bienvenida, solo con sesión.
 */
export function HelpContent({ locale, values, signedIn, tutorial }: { locale: Locale; values: AppValues; signedIn: boolean; tutorial?: ReactNode }) {
  const t = HELP_TEXTS[locale];
  const A = signedIn ? LinkTo : NameOf;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-sm text-muted">{t.intro}</p>
        </div>
        {tutorial}
      </div>
      <section aria-label={t.topics} className="card">
        {locale === "es" ? <SpanishTopics values={values} A={A} /> : <EnglishTopics values={values} A={A} />}
      </section>
      <section aria-labelledby="preguntas-frecuentes" className="card">
        <h2 id="preguntas-frecuentes" className="px-4 pb-1 pt-4 font-semibold">
          {t.faq}
        </h2>
        {locale === "es" ? <SpanishFaq values={values} A={A} /> : <EnglishFaq values={values} A={A} />}
      </section>
    </div>
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

/** Los comandos del bot en el idioma de la página, de la misma lista que su respuesta a "ayuda". */
function BotCommands({ locale }: { locale: Locale }) {
  const or = locale === "es" ? "o" : "or";
  return (
    <ul className="list-disc space-y-1 pl-5">
      {[...BOT_COMMANDS[locale], HELP_COMMAND[locale]].map((c) => (
        <li key={c.command}>
          <strong>{c.command}</strong>
          {c.alternative && (
            <>
              {" "}
              {or} <strong>{c.alternative}</strong>
            </>
          )}{" "}
          — {c.description}
          {c.also && (
            <>
              {" "}
              ({or} {c.also.command}, {c.also.description})
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function BotExamples({ locale }: { locale: Locale }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {BOT_EXAMPLES[locale].map((example) => (
        <li key={example}>
          <em>{example}</em>
        </li>
      ))}
    </ul>
  );
}

function SpanishTopics({ values, A }: { values: AppValues; A: PageLink }) {
  return (
    <>
      <Topic title="Registrar ingresos y egresos">
        <p>
          En <A href="/ingresos">Ingresos</A> o <A href="/egresos">Egresos</A>, escribe el monto, la descripción, la categoría y la fecha
          (nunca después de hoy) y toca <strong>Registrar ingreso</strong> o <strong>Registrar egreso</strong>. Al escribir la descripción te sugerimos las que ya usaste, con su
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
        <p>
          Si pasan {REMINDER_DAYS} días sin que registres nada, te lo recordamos en el <A href="/dashboard">Resumen</A> y en la campana,
          para que tus cuentas del mes queden completas. En <A href="/configuracion#recordatorio">Configuración → Recordatorio de
          registro</A> puedes apagarlo o elegir después de cuántos días llega (de {REMINDER_DAYS_MIN} a {REMINDER_DAYS_MAX}).
        </p>
      </Topic>

      <Topic title="El bot de WhatsApp">
        <p>
          Conéctalo en <A href="/cuenta">Mi cuenta</A>: toca <strong>Conectar WhatsApp</strong> y envíale al bot el mensaje que te aparece (<strong>{LINK_WORD.es}</strong> y el código).
        </p>
        <p>Después, escríbele tus ingresos y gastos como se los contarías a alguien:</p>
        <BotExamples locale="es" />
        <p>O envíale la foto de una factura o un recibo: registra un egreso por el total.</p>
        <p>También entiende estos comandos:</p>
        <BotCommands locale="es" />
      </Topic>

      <Topic title="Gastos fijos y avisos de pagos">
        <p>
          Un <strong>gasto fijo</strong> es un egreso con la misma descripción en al menos {values.recurringMinMonths} de los últimos{" "}
          {values.recurringWindow} meses (el arriendo, Netflix, el plan del celular). Los ves en <A href="/gastos-fijos">Fijos</A>: puedes
          quitar uno que no lo es, agregar otro a mano y abrir el historial de su valor, con una nota por cada cambio.
        </p>
        <p>Cada uno dice si ya lo pagaste este mes, y arriba ves cuántos van y cuánto falta.</p>
        <p>
          En el <A href="/dashboard">Resumen</A> y en la campana de arriba te avisamos de los que tocan pronto
          {values.upcomingEnabled
            ? `, ${daysAheadPhrase(values.upcomingDays)} si no lo cambias. También de los atrasados, hasta ${MONTHS_BACK} meses atrás.`
            : ` y de los atrasados (hasta ${MONTHS_BACK} meses atrás) si prendes los avisos en Configuración.`}{" "}
          La fecha sale del día en que pagaste las últimas{" "}
          {PAYMENTS_FOR_DAY} veces; con menos pagos, dice <strong>aprox.</strong>
        </p>
        <p>
          En cada aviso: <strong>Registrar pago</strong> lo registra con el monto y la fecha que confirmes, y{" "}
          <strong>Este pago ya no aplica</strong> lo oculta solo ese mes. En la campana, <strong>Marcar como leída</strong> lo saca de
          ahí (sigue en el Resumen).
        </p>
        <p>
          En <A href="/configuracion#notificaciones">Configuración → Notificaciones</A> puedes apagar los avisos o elegir con cuántos días de anticipación llegan
          (de 0, el mismo día, a {MAX_DAYS_AHEAD}).
        </p>
        <p>
          En el Resumen, <strong>Lo que te queda este mes</strong> resta de lo que te entró lo que ya gastaste y los fijos que faltan
          por pagar. También te dice cuánto te da por día hasta fin de mes y, desde el día {PROJECTION_FROM_DAY}, cómo cerrarías el mes a
          tu ritmo de gasto.
        </p>
        <p>
          Debajo de <strong>Egresos por categoría</strong>, el <strong>Dato del mes</strong> te dice qué se salió de lo normal. Compara
          lo que llevas este mes con lo que solías llevar a esta altura en tus últimos meses, sin los gastos fijos. Sale la categoría
          que más subió en plata (al menos {formatPercent(FACT_MIN_SHARE)} y {formatMoney(FACT_MIN_AMOUNT, "COP")}) o, si ninguna, la que
          más bajó.
        </p>
      </Topic>

      <Topic title="Presupuestos">
        <p>
          En <A href="/configuracion#presupuestos">Configuración → Presupuestos</A> le pones un tope por mes a las categorías de egresos que quieras cuidar: vale
          todos los meses hasta que lo cambies o lo quites. Llegas ahí desde el <A href="/dashboard">Resumen</A>.
        </p>
        <p>
          En el Resumen ves cuánto llevas de cada una en el mes y cuánto te queda. Desde el {formatPercent(values.budgetNearShare)} del presupuesto,
          la línea se resalta; si te pasas, sale en rojo con cuánto.
        </p>
        <p>
          Cuando un egreso de este mes hace llegar una categoría al {formatPercent(values.budgetNearShare)} o pasarse, te avisamos una vez. Si lo
          registras por WhatsApp, el aviso va en la respuesta del bot; en Egresos, debajo del formulario.
        </p>
      </Topic>

      <Topic title="Reportes y descargas">
        <p>
          En <A href="/reportes">Reportes</A> ves cómo te va en los últimos 12 meses o en un año:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>tus cifras y los ingresos y egresos de cada mes;</li>
          <li>cuánto suma cada categoría, y cómo le fue el último mes frente a su promedio;</li>
          <li>tus {BIGGEST_SHOWN} egresos más grandes y qué días gastas más.</li>
        </ul>
        <p>Los gastos fijos no cuentan entre los más grandes ni en los días.</p>
        <p>
          Con <strong>Descargar</strong>, arriba a la derecha, bajas los movimientos del período en <strong>CSV</strong> (para Excel o Google
          Sheets) o el reporte en <strong>PDF</strong> (para guardar o imprimir).
        </p>
      </Topic>

      <Topic title="Tu cuenta y tus datos">
        <p>
          En <A href="/cuenta">Mi cuenta</A> cambias tu contraseña (se cierran tus otras sesiones) y conectas o desvinculas WhatsApp. En{" "}
          <A href="/configuracion">Configuración</A> pones tus presupuestos, configuras las notificaciones y eliges la apariencia (clara,
          oscura o la de tu dispositivo) y el idioma.
        </p>
        <p>
          También puedes borrar tu cuenta en <strong>Eliminar mi cuenta</strong>: se borra todo de inmediato y no se puede deshacer. Lo que guardamos y por
          cuánto tiempo está en la <A href="/privacidad">política de privacidad</A>.
        </p>
      </Topic>
    </>
  );
}

function EnglishTopics({ values, A }: { values: AppValues; A: PageLink }) {
  return (
    <>
      <Topic title="Adding income and expenses">
        <p>
          In <A href="/ingresos">Income</A> or <A href="/egresos">Expenses</A>, enter the amount, the description, the category and the
          date (never after today) and tap <strong>Add income</strong> or <strong>Add expense</strong>. As you type the description, we suggest the ones you&apos;ve used, with
          their category.
        </p>
        <p>
          To edit a transaction, tap the pencil; to delete it, tap the trash can. If you deleted it by mistake, tap{" "}
          <strong>Undo</strong> in the notice that shows up below.
        </p>
        <p>
          To see another month, tap the month&apos;s name at the top of the page. With {SEARCH_FROM} or more transactions in the month,
          the list has a search box by description or category.
        </p>
        <p>
          If {REMINDER_DAYS} days go by without you adding anything, we remind you in the <A href="/dashboard">Overview</A> and in the
          bell, so your month&apos;s numbers stay complete. In <A href="/configuracion#recordatorio">Settings → Reminder to add transactions</A> you can
          turn it off or choose after how many days it comes (from {REMINDER_DAYS_MIN} to {REMINDER_DAYS_MAX}).
        </p>
      </Topic>

      <Topic title="The WhatsApp bot">
        <p>
          Connect it in <A href="/cuenta">My account</A>: tap <strong>Connect WhatsApp</strong> and send the bot the message you see (<strong>{LINK_WORD.en}</strong> and the code).
        </p>
        <p>Then send it your income and expenses the way you&apos;d tell someone:</p>
        <BotExamples locale="en" />
        <p>Or send it a photo of a receipt: it adds an expense for the total.</p>
        <p>It also understands these commands:</p>
        <BotCommands locale="en" />
      </Topic>

      <Topic title="Bills and payment notices">
        <p>
          A <strong>bill</strong> is an expense with the same description in at least {values.recurringMinMonths} of the last{" "}
          {values.recurringWindow} months (rent, Netflix, your phone plan). You see them in <A href="/gastos-fijos">Bills</A>: you can remove
          one that isn&apos;t, add another one yourself and open the history of its amount, with a note for each change.
        </p>
        <p>Each one says whether you already paid it this month, and at the top you see how many are paid and how much is left.</p>
        <p>
          In the <A href="/dashboard">Overview</A> and in the bell at the top we let you know about the ones coming up
          {values.upcomingEnabled
            ? `, ${daysAheadPhrase(values.upcomingDays, "en")} unless you change it. Also about the overdue ones, up to ${MONTHS_BACK} months back.`
            : ` and the overdue ones (up to ${MONTHS_BACK} months back) if you turn the notices on in Settings.`}{" "}
          The date comes from the day you paid the
          last {PAYMENTS_FOR_DAY} times; with fewer payments, it says <strong>approx.</strong>
        </p>
        <p>
          In each notice: <strong>Add payment</strong> adds it with the amount and date you confirm, and{" "}
          <strong>This payment doesn&apos;t apply</strong> hides it for that month only. In the bell, <strong>Mark as read</strong> removes
          it from there (it stays in the Overview).
        </p>
        <p>
          In <A href="/configuracion#notificaciones">Settings → Notifications</A> you can turn the notices off or choose how many days in advance they come
          (from 0, the same day, to {MAX_DAYS_AHEAD}).
        </p>
        <p>
          In the Overview, <strong>What&apos;s left this month</strong> takes what you&apos;ve spent and the bills still to pay from what
          came in. It also tells you how much that gives you a day until month&apos;s end and, from day {PROJECTION_FROM_DAY}, how you&apos;d
          end the month at your spending pace.
        </p>
        <p>
          Below <strong>Expenses by category</strong>, <strong>This month</strong> tells you what&apos;s off its usual. It compares what
          you have so far this month with what you usually had by this point, without bills. It shows the category that went up the most
          in money (at least {formatPercent(FACT_MIN_SHARE, "en")} and {formatMoney(FACT_MIN_AMOUNT, "COP", "en")}) or, if none did, the
          one that went down the most.
        </p>
      </Topic>

      <Topic title="Budgets">
        <p>
          In <A href="/configuracion#presupuestos">Settings → Budgets</A> you set a monthly limit for the expense categories you want to watch: it applies every
          month until you change or remove it. You get there from the <A href="/dashboard">Overview</A>.
        </p>
        <p>
          In the Overview you see how much you&apos;ve spent in each one this month and how much you have left. From{" "}
          {formatPercent(values.budgetNearShare, "en")} of the budget the line stands out; if you go over, it turns red and shows by how much.
        </p>
        <p>
          When an expense this month takes a category to {formatPercent(values.budgetNearShare, "en")} or over its budget, we let you know once. If
          you add it on WhatsApp, the notice comes in the bot&apos;s reply; in Expenses, below the form.
        </p>
      </Topic>

      <Topic title="Reports and downloads">
        <p>
          In <A href="/reportes">Reports</A> you see how you&apos;re doing over the last 12 months or a year:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your figures and the income and expenses of each month;</li>
          <li>what each category adds up to, and how it did in the period&apos;s last month compared with its average;</li>
          <li>
            your {BIGGEST_SHOWN} biggest expenses and which days you spend the most.
          </li>
        </ul>
        <p>Bills don&apos;t count among the biggest or in the days.</p>
        <p>
          With <strong>Download</strong>, at the top right, you get the period&apos;s transactions as <strong>CSV</strong> (for Excel or Google
          Sheets) or the report as <strong>PDF</strong> (to save or print).
        </p>
      </Topic>

      <Topic title="Your account and your data">
        <p>
          In <A href="/cuenta">My account</A> you change your password (your other sessions are signed out) and connect or unlink
          WhatsApp. In <A href="/configuracion">Settings</A> you set your budgets, set up notifications and choose the appearance (light,
          dark or your device&apos;s) and the language.
        </p>
        <p>
          You can also delete your account in <strong>Delete my account</strong>: everything is deleted right away and it can&apos;t be undone. What we keep
          and for how long is in the <A href="/privacidad">privacy policy</A> (in Spanish).
        </p>
      </Topic>
    </>
  );
}

/** El correo de contacto, para lo que no se resuelve desde la app. */
const ContactEmail = () => (
  <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand underline-offset-2 hover:underline">
    {CONTACT_EMAIL}
  </a>
);

/**
 * Las preguntas frecuentes (decididas con el dueño): las dudas de quien ya usa la app, con la respuesta corta y
 * dónde se hace. Los números salen de las constantes de la app, como en los temas.
 */
function SpanishFaq({ values, A }: { values: AppValues; A: PageLink }) {
  return (
    <>
      <Topic title="¿Por qué el bot no me responde?">
        <p>
          Escríbele desde el número que vinculaste en <A href="/cuenta">Mi cuenta</A>: si le escribes desde otro, te dice que ese
          número no está vinculado y cómo conectarlo.
        </p>
        <p>Si no te llega ninguna respuesta, puede ser una falla pasajera: espera un rato y vuelve a escribirle.</p>
      </Topic>
      <Topic title="¿Por qué el bot no entendió mi mensaje?">
        <p>
          Escríbele el movimiento completo, con lo que fue y el monto: “almuerzo 25 mil” o “me pagaron la quincena 2.100.000”. Los
          montos van como en Colombia, con punto para los miles y coma para los centavos (25.900,50). También entiende mil, lucas y
          palos (“20 mil”, “medio palo”).
        </p>
        <p>
          Puedes enviarle hasta {MAX_TRANSACTIONS_PER_MESSAGE} movimientos en un mensaje. No recuerda el mensaje anterior: si le falta
          algo, envíale el movimiento completo otra vez.
        </p>
      </Topic>
      <Topic title="El bot registró algo mal, ¿cómo lo corrijo?">
        <p>
          Escríbele <strong>deshacer</strong>: borra todo lo que registró con tu último mensaje. Si solo quieres cambiar un dato, en{" "}
          <A href="/ingresos">Ingresos</A> o <A href="/egresos">Egresos</A> toca el lápiz del movimiento.
        </p>
      </Topic>
      <Topic title="¿El bot entiende notas de voz o fotos?">
        <p>
          Entiende fotos de facturas y recibos: envíale la foto y registra un egreso por el total, con el nombre del comercio y la
          fecha de la factura (si es de los últimos {PHOTO_MAX_DAYS_BACK} días; si no, la de hoy). Puedes escribir algo con la foto,
          como “almuerzo con Juan”, para ayudarle. Una factura por foto.
        </p>
        <p>
          La foto no se guarda: solo lo que se registró. Notas de voz, todavía no: si le envías un audio, te lo recuerda.
        </p>
      </Topic>
      <Topic title="¿Por qué no veo un gasto fijo?">
        <p>
          Un egreso aparece en <A href="/gastos-fijos">Fijos</A> cuando tiene la misma descripción en al menos {values.recurringMinMonths}{" "}
          de los últimos {values.recurringWindow} meses, sin importar mayúsculas ni tildes. Si lo registras con nombres distintos (“Arriendo”
          y “Pago del arriendo”), no se reconoce como un solo gasto.
        </p>
        <p>
          Para sumarlo igual, toca <strong>Agregar un gasto fijo</strong> en Fijos.
        </p>
      </Topic>
      <Topic title="Me avisa de un pago que ya hice">
        <p>
          El aviso se quita cuando registras el pago de ese mes con la misma descripción del gasto fijo. Si lo registraste con otra,
          edítalo con el lápiz para que coincida. Si este mes no tienes que pagarlo, toca <strong>Este pago ya no aplica</strong>.
        </p>
      </Topic>
      <Topic title="¿Puedo recuperar un movimiento que borré?">
        <p>
          Sí, justo después: toca <strong>Deshacer</strong> en el aviso que aparece abajo al borrarlo. Cuando el aviso se va, ya no se
          puede recuperar.
        </p>
      </Topic>
      <Topic title="¿Por qué un movimiento sale en otro mes?">
        <p>
          Cada movimiento va en el mes de su fecha, no en el del día en que lo registraste. El bot usa la fecha de hoy, salvo que le digas
          otra (“ayer”, “el lunes”, “el 5”). Para cambiarla, edita el movimiento con el lápiz.
        </p>
      </Topic>
      <Topic title="¿Cómo cambio mi número de WhatsApp?">
        <p>
          En <A href="/cuenta">Mi cuenta</A>, en la tarjeta de WhatsApp, toca <strong>Desvincular número</strong>. Después toca{" "}
          <strong>Conectar WhatsApp</strong> y envíale al bot, desde el número nuevo, el mensaje que te aparece.
        </p>
      </Topic>
      <Topic title="¿Quién ve mis movimientos?">
        <p>
          Solo tú. Para darte soporte, la administración de la app ve los datos de tu cuenta (nombre, correo y número de WhatsApp) y
          cuántos mensajes le enviaste al bot. No ve tus movimientos ni el texto de tus mensajes. Todo está en la{" "}
          <A href="/privacidad">política de privacidad</A>.
        </p>
      </Topic>
      <Topic title="¿Cómo descargo mis datos?">
        <p>
          En <A href="/reportes">Reportes</A>, toca <strong>Descargar</strong>: <strong>Movimientos (CSV)</strong>, para Excel o Google
          Sheets, o <strong>Reporte (PDF)</strong>, para guardar o imprimir. Son los del período que estás viendo.
        </p>
      </Topic>
      <Topic title="Olvidé mi contraseña">
        <p>
          Por ahora no se puede recuperar desde la app. Escríbenos a{" "}
          <ContactEmail />{" "}
          desde el correo de tu cuenta y te ayudamos. Si la recuerdas y quieres cambiarla, hazlo en <A href="/cuenta">Mi cuenta</A>.
        </p>
      </Topic>
    </>
  );
}

function EnglishFaq({ values, A }: { values: AppValues; A: PageLink }) {
  return (
    <>
      <Topic title="Why isn't the bot answering me?">
        <p>
          Write from the number you linked in <A href="/cuenta">My account</A>: if you write from another one, it tells you that number
          isn&apos;t linked and how to connect it.
        </p>
        <p>If you don&apos;t get any answer, it may be a temporary issue: wait a while and write again.</p>
      </Topic>
      <Topic title="Why didn't the bot understand my message?">
        <p>
          Write the whole transaction, with what it was and the amount: “lunch 25k” or “I got paid 2.100.000”. Amounts are in Colombian
          pesos, written as in Colombia: a period for thousands and a comma for cents (25.900,50).
        </p>
        <p>
          You can send up to {MAX_TRANSACTIONS_PER_MESSAGE} transactions in one message. It doesn&apos;t remember the previous message: if
          something is missing, send the whole transaction again.
        </p>
      </Topic>
      <Topic title="The bot added something wrong. How do I fix it?">
        <p>
          Send it <strong>undo</strong>: it deletes everything it added from your last message. To change just one detail,
          in <A href="/ingresos">Income</A> or <A href="/egresos">Expenses</A> tap the transaction&apos;s pencil.
        </p>
      </Topic>
      <Topic title="Does the bot understand voice notes or photos?">
        <p>
          It understands photos of receipts: send it the photo and it adds an expense for the total, with the store&apos;s
          name and the date on the receipt (if it&apos;s from the last {PHOTO_MAX_DAYS_BACK} days; otherwise, today&apos;s). You can
          write something with the photo, like “lunch with Juan”, to help it. One receipt per photo.
        </p>
        <p>
          The photo isn&apos;t saved: only what was added. Voice notes, not yet: if you send it audio, it reminds you.
        </p>
      </Topic>
      <Topic title="Why don't I see a bill?">
        <p>
          An expense shows up in <A href="/gastos-fijos">Bills</A> when it has the same description in at least {values.recurringMinMonths} of
          the last {values.recurringWindow} months, regardless of capital letters or accents. If you add it with different names
          (“Rent” and “Rent payment”), it isn&apos;t recognized as the same one.
        </p>
        <p>
          To include it anyway, tap <strong>Add a bill</strong> in Bills.
        </p>
      </Topic>
      <Topic title="It warns me about a payment I already made">
        <p>
          The notice goes away when you add that month&apos;s payment with the same description as the bill. If you added it with another
          one, edit it with the pencil so they match. If you don&apos;t have to pay it this month, tap{" "}
          <strong>This payment doesn&apos;t apply</strong>.
        </p>
      </Topic>
      <Topic title="Can I get back a transaction I deleted?">
        <p>
          Yes, right after: tap <strong>Undo</strong> in the notice that shows up below when you delete it. Once the notice is gone, it
          can&apos;t be recovered.
        </p>
      </Topic>
      <Topic title="Why does a transaction show up in another month?">
        <p>
          Each transaction goes in the month of its date, not the day you added it. The bot uses today&apos;s date unless you tell it another
          one (“yesterday”, “on Monday”, “on the 5th”). To change it, edit the
          transaction with the pencil.
        </p>
      </Topic>
      <Topic title="How do I change my WhatsApp number?">
        <p>
          In <A href="/cuenta">My account</A>, on the WhatsApp card, tap <strong>Unlink number</strong>. Then tap{" "}
          <strong>Connect WhatsApp</strong> and send the bot, from the new number, the message you see.
        </p>
      </Topic>
      <Topic title="Who sees my transactions?">
        <p>
          Only you. To give you support, the app&apos;s administrators see your account details (name, email and WhatsApp number) and how
          many messages you sent the bot. They don&apos;t see your transactions or the text of your messages. It&apos;s all in the{" "}
          <A href="/privacidad">privacy policy</A> (in Spanish).
        </p>
      </Topic>
      <Topic title="How do I download my data?">
        <p>
          In <A href="/reportes">Reports</A>, tap <strong>Download</strong>: <strong>Transactions (CSV)</strong>, for Excel or Google
          Sheets, or <strong>Report (PDF)</strong>, to save or print. They&apos;re the ones from the period you&apos;re viewing.
        </p>
      </Topic>
      <Topic title="I forgot my password">
        <p>
          For now it can&apos;t be recovered from the app. Write to us at{" "}
          <ContactEmail />{" "}
          from your account&apos;s email and we&apos;ll help you. If you remember it and want to change it, do it in{" "}
          <A href="/cuenta">My account</A>.
        </p>
      </Topic>
    </>
  );
}
