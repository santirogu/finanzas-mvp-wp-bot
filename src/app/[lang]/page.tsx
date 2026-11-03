import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import type { ReactNode } from "react";
import { LogoMark, Logo } from "@/components/logo";
import type { Locale } from "@/i18n/locales";
import { getLocale, getTexts } from "@/i18n/server";
import { texts } from "@/i18n/texts";
import { BRAND_NAME } from "@/lib/brand";
import { formatMoney } from "@/lib/money";

// La página de inicio: qué es Anotado, una conversación de ejemplo con el bot y para qué sirve. El ejemplo va
// en el idioma de la página, como responde el bot a una cuenta en ese idioma.

const TEXTS = texts(
  {
    heading: "Escribe tu gasto por WhatsApp. Queda anotado.",
    body: "Le escribes al bot como a cualquier persona y registra el monto, la descripción y la categoría. En la web ves tu mes, tus reportes y tus gastos fijos.",
    register: "Crear cuenta",
    login: "Iniciar sesión",
    example: "Una conversación de ejemplo con el bot",
    // Resumido de lo que responde el bot (src/modules/bot/replies.ts).
    chat: {
      first: "gasté 25 mil en almuerzo",
      second: "y 12 mil de taxi",
      registered: `Egreso ${BRAND_NAME}`,
      lunch: { description: "Almuerzo", category: "Alimentación" },
      taxi: { description: "Taxi", category: "Transporte" },
      balance: "Balance del mes",
    },
    featuresTitle: `Qué hace ${BRAND_NAME}`,
    features: [
      {
        icon: "chat",
        title: "Por WhatsApp",
        body: (
          <>
            Escribe como hablas: “gasté 25 mil en almuerzo”. Si se equivoca, escribe <strong>deshacer</strong>.
          </>
        ) as ReactNode,
      },
      { icon: "chart", title: "Tu mes en claro", body: "El balance, en qué se te va la plata y tus gastos fijos, con un aviso antes de cada pago." },
      { icon: "lock", title: "Tus datos son tuyos", body: "Sin conectar tu banco y sin anuncios. Borras tu cuenta y tus datos cuando quieras." },
    ],
    privacy: "Política de privacidad",
    help: "Ayuda",
  },
  {
    en: {
      heading: "Text your expense on WhatsApp. It's noted.",
      body: "Write to the bot as you would to anyone, and it adds the transaction with its amount, description and category. On the web you see your month, your reports and your bills.",
      register: "Create account",
      login: "Sign in",
      example: "An example conversation with the bot",
      chat: {
        first: "spent 25k on lunch",
        second: "and 12k for a taxi",
        registered: "Expense noted",
        lunch: { description: "Lunch", category: "Food" },
        taxi: { description: "Taxi", category: "Transportation" },
        balance: "This month's balance",
      },
      featuresTitle: `What ${BRAND_NAME} does`,
      features: [
        {
        icon: "chat",
        title: "On WhatsApp",
        body: (
          <>
            Write the way you talk: “spent 25k on lunch”. If it gets something wrong, send <strong>undo</strong>.
          </>
        ),
      },
        { icon: "chart", title: "Your month, clear", body: "Your balance, where your money goes and your bills, with a notice before each payment." },
        { icon: "lock", title: "Your data is yours", body: "No bank connection and no ads. Delete your account and your data whenever you want." },
      ],
      privacy: "Privacy policy",
      help: "Help",
    },
  },
);

// Los íconos de los beneficios (trazos simples, del color de la marca).
const ICONS: Record<string, React.ReactNode> = {
  chat: <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15a2 2 0 0 1-2-2z" />,
  chart: <path d="M5 19V9m7 10V5m7 14v-7" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
};

export default async function Home() {
  const t = await getTexts(TEXTS);
  const locale = await getLocale();
  return (
    <div className="flex flex-1 flex-col">
      {/* El logo, la Ayuda, el selector de idioma e "Iniciar sesión": en una pantalla muy angosta (320 px), los tres
          últimos pasan a una segunda fila en vez de salirse de la pantalla. */}
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Logo className="text-xl" markClassName="size-8" />
        <div className="flex items-center gap-2">
          {/* Sin precargar: con sesión, /ayuda es otra página, y la precargada podría quedar en el navegador después
              de entrar (src/proxy.ts). */}
          <Link
            href="/ayuda"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-muted hover:text-foreground pointer-fine:min-h-9"
          >
            {t.help}
          </Link>
          <LanguageSwitch />
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface sm:px-4 pointer-fine:min-h-9"
          >
            {t.login}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 sm:px-6">
        <div className="grid grid-cols-1 items-center gap-12 py-10 lg:grid-cols-2 lg:py-16">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t.heading}</h1>
            <p className="mt-5 text-lg text-muted">{t.body}</p>
            {/* "Iniciar sesión" está arriba, en la barra: aquí, solo lo que hace quien llega por primera vez. */}
            <Link href="/registro" className="btn-primary mt-8">
              {t.register}
            </Link>
          </div>
          <ChatExample label={t.example} chat={t.chat} locale={locale} />
        </div>

        <section aria-labelledby="que-hace">
          <h2 id="que-hace" className="sr-only">
            {t.featuresTitle}
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {t.features.map((feature) => (
              <li key={feature.title} className="card p-5">
                <svg viewBox="0 0 24 24" aria-hidden className="size-6 fill-none stroke-brand" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[feature.icon]}
                </svg>
                <h3 className="mt-3 font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap gap-x-4 gap-y-2 px-4 pb-10 text-xs text-muted sm:px-6">
        <Link href="/ayuda" prefetch={false} className="underline underline-offset-2 hover:text-foreground">
          {t.help}
        </Link>
        <Link href="/privacidad" className="underline underline-offset-2 hover:text-foreground">
          {t.privacy}
        </Link>
      </footer>
    </div>
  );
}

/** Una conversación con el bot, como se ve en WhatsApp: tu mensaje a la derecha y la respuesta a la izquierda. */
function ChatExample({ label, chat, locale }: { label: string; chat: (typeof TEXTS)[Locale]["chat"]; locale: Locale }) {
  const money = (amount: number) => formatMoney(amount, "COP", locale);
  const sent = "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand/10 px-4 py-2.5";
  const received = "mr-auto w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-background px-4 py-2.5";
  return (
    <figure className="card mx-auto w-full max-w-md p-4 sm:p-5">
      <figcaption className="flex items-center gap-3 border-b border-border pb-3">
        <LogoMark className="size-9" />
        <span className="min-w-0">
          <span className="block font-semibold">{BRAND_NAME}</span>
          <span className="block text-xs text-muted">{label}</span>
        </span>
      </figcaption>
      <ol className="mt-4 space-y-3 text-sm">
        <li className={sent}>{chat.first}</li>
        <li className={received}>
          ✅ {chat.registered}: <strong>{chat.lunch.description}</strong> — {money(25000)} ({chat.lunch.category})
        </li>
        <li className={sent}>{chat.second}</li>
        <li className={received}>
          ✅ {chat.registered}: <strong>{chat.taxi.description}</strong> — {money(12000)} ({chat.taxi.category})
          <span className="mt-1 block text-muted">
            {chat.balance}: <strong className="text-foreground">{money(1284500)}</strong>
          </span>
        </li>
      </ol>
    </figure>
  );
}
