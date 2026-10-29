"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useLocale, useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";
import { BRAND_NAME } from "@/lib/brand";
import { formatPercent } from "@/lib/money";
import { finishTutorialAction } from "@/modules/tutorial/actions";
import { LogoMark } from "./logo";

// El tutorial de bienvenida: una ventana con las funciones principales en pasos cortos. Una cuenta nueva lo ve al
// entrar al Resumen hasta que lo termina o lo omite (src/modules/tutorial/); desde Ayuda se vuelve a ver.

/** Lo que cambia en los textos: los valores de la app (src/modules/app-values/). */
export type TutorialValues = { upcomingEnabled: boolean; budgetNearShare: number };

type Icon = "logo" | "summary" | "whatsapp" | "bills" | "reports";
type Step = { icon: Icon; title: string; body: ReactNode; whatsapp?: true };

/** Donde se conecta el WhatsApp (src/app/[lang]/(app)/cuenta/whatsapp-card.tsx). */
const WHATSAPP_HREF = "/cuenta#whatsapp";

const TEXTS = texts(
  {
    skip: "Omitir",
    back: "Atrás",
    next: "Siguiente",
    start: "Empezar",
    connect: "Conectar WhatsApp",
    progress: (step: number, total: number) => `Paso ${step} de ${total}`,
    steps: ({ upcomingEnabled, near }: { upcomingEnabled: boolean; near: string }): Step[] => [
      {
        icon: "logo",
        title: `Te damos la bienvenida a ${BRAND_NAME}`,
        body: "Aquí llevas tus ingresos y egresos y ves cómo te va cada mes. Te mostramos lo principal en cinco pasos cortos.",
      },
      {
        icon: "summary",
        title: "Tu mes de un vistazo",
        body: (
          <>
            En el <strong>Resumen</strong> ves tus ingresos, tus egresos y el balance del mes. Cada movimiento se registra en{" "}
            <strong>Ingresos</strong> o <strong>Egresos</strong>.
          </>
        ),
      },
      {
        icon: "whatsapp",
        title: "Anota por WhatsApp",
        body: (
          <>
            Escríbele al bot como se lo contarías a alguien (“almuerzo 25 mil”) o envíale la foto de una factura, y queda registrado.
            Conéctalo en <strong>Mi cuenta</strong>.
          </>
        ),
        whatsapp: true,
      },
      {
        icon: "bills",
        title: "Tus gastos fijos",
        body: upcomingEnabled ? (
          <>
            En <strong>Fijos</strong> ves lo que pagas cada mes, como el arriendo o Netflix, y te avisamos de los que tocan pronto.
          </>
        ) : (
          <>
            En <strong>Fijos</strong> ves lo que pagas cada mes, como el arriendo o Netflix. Si prendes los avisos en{" "}
            <strong>Configuración</strong>, te avisamos de los que tocan pronto.
          </>
        ),
      },
      {
        icon: "reports",
        title: "Cómo te va",
        body: (
          <>
            En <strong>Reportes</strong> ves cómo te va mes a mes. En <strong>Configuración</strong> le pones un presupuesto a tus
            categorías y te avisamos al llegar al {near}.
          </>
        ),
      },
    ],
  },
  {
    en: {
      skip: "Skip",
      back: "Back",
      next: "Next",
      start: "Get started",
      connect: "Connect WhatsApp",
      progress: (step, total) => `Step ${step} of ${total}`,
      steps: ({ upcomingEnabled, near }) => [
        {
          icon: "logo",
          title: `Welcome to ${BRAND_NAME}`,
          body: "Here you add your income and expenses and see how you're doing every month. Here are the essentials in five short steps.",
        },
        {
          icon: "summary",
          title: "Your month at a glance",
          body: (
            <>
              In <strong>Overview</strong> you see your income, your expenses and the month&apos;s balance. You add each transaction in{" "}
              <strong>Income</strong> or <strong>Expenses</strong>.
            </>
          ),
        },
        {
          icon: "whatsapp",
          title: "Add it on WhatsApp",
          body: (
            <>
              Write to the bot the way you&apos;d tell someone (<span lang="es">“almuerzo 25 mil”</span>) or send it a photo of a
              receipt, and it&apos;s added. For now it answers in Spanish. Connect it in <strong>My account</strong>.
            </>
          ),
          whatsapp: true,
        },
        {
          icon: "bills",
          title: "Your bills",
          body: upcomingEnabled ? (
            <>
              In <strong>Bills</strong> you see what you pay every month, like rent or Netflix, and we let you know about the ones
              coming up.
            </>
          ) : (
            <>
              In <strong>Bills</strong> you see what you pay every month, like rent or Netflix. If you turn on notices in{" "}
              <strong>Settings</strong>, we let you know about the ones coming up.
            </>
          ),
        },
        {
          icon: "reports",
          title: "How you're doing",
          body: (
            <>
              In <strong>Reports</strong> you see how you&apos;re doing month to month. In <strong>Settings</strong> you set a budget
              for your categories and we let you know when you reach {near}.
            </>
          ),
        },
      ],
    },
  },
);

/**
 * La ventana se abre al montarse. `remember`: al cerrarla (con Empezar, Omitir, Esc o el enlace a Mi cuenta), no
 * vuelve a salir (la primera vez, en el Resumen); desde Ayuda no hace falta. `onClose`, para desmontarla.
 */
export function WelcomeTutorial({ values, remember = false, onClose }: { values: TutorialValues; remember?: boolean; onClose?: () => void }) {
  const t = useTexts(TEXTS);
  const locale = useLocale();
  const steps = t.steps({ upcomingEnabled: values.upcomingEnabled, near: formatPercent(values.budgetNearShare, locale) });
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const ids = { title: useId(), body: useId() };
  const step = steps[index];
  const last = index === steps.length - 1;
  const close = () => dialog.current?.close();
  // Se abre una sola vez, al montarse (por eso la función es estable), con el foco en Siguiente: el autoFocus de
  // React corre antes de abrirla y el navegador enfocaría Omitir, el primer botón.
  const openDialog = useCallback((element: HTMLDialogElement | null) => {
    dialog.current = element;
    if (element && !element.open) {
      element.showModal();
      primary.current?.focus();
    }
  }, []);

  return (
    <dialog
      ref={openDialog}
      onClose={() => {
        if (remember) void finishTutorialAction();
        onClose?.();
      }}
      aria-labelledby={ids.title}
      aria-describedby={ids.body}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex min-h-11 items-start justify-between gap-4 pointer-fine:min-h-9">
          <StepIcon icon={step.icon} />
          {/* En el último paso, Empezar ya cierra. */}
          {!last && (
            <button
              type="button"
              onClick={close}
              className="-mr-2 min-h-11 rounded-lg px-3 text-sm font-medium text-muted hover:bg-background hover:text-foreground pointer-fine:min-h-9"
            >
              {t.skip}
            </button>
          )}
        </div>
        {/* Al cambiar de paso, el foco se queda en Siguiente: el lector de pantalla lee el paso nuevo desde aquí. */}
        <div aria-live="polite" className="space-y-2">
          <p className="sr-only">{t.progress(index + 1, steps.length)}</p>
          <h2 id={ids.title} className="text-lg font-semibold">
            {step.title}
          </h2>
          <p id={ids.body} className="text-sm text-muted">
            {step.body}
          </p>
        </div>
        {step.whatsapp && (
          // Va a Mi cuenta: la ventana se cierra antes (si no, la página siguiente quedaría inerte detrás de ella).
          <Link href={WHATSAPP_HREF} onClick={close} className="self-start text-sm font-medium text-brand underline-offset-4 hover:underline">
            {t.connect} <span aria-hidden>→</span>
          </Link>
        )}
        <div className="flex items-center justify-between gap-2">
          <ol aria-hidden className="flex gap-1.5">
            {steps.map((s, i) => (
              <li key={s.icon} className={`size-2 rounded-full ${i === index ? "bg-brand" : "bg-border"}`} />
            ))}
          </ol>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => {
                  // En el primer paso no hay Atrás: el foco pasa a Siguiente en vez de perderse.
                  flushSync(() => setIndex(index - 1));
                  if (index === 1) primary.current?.focus();
                }}
                className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-background pointer-fine:min-h-9"
              >
                {t.back}
              </button>
            )}
            <button
              ref={primary}
              type="button"
              onClick={() => (last ? close() : setIndex(index + 1))}
              className="btn-primary min-h-11 pointer-fine:min-h-9"
            >
              {last ? t.start : t.next}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** El dibujo de cada paso (decorativo: el título ya lo dice), en el estilo de los íconos de la app. */
function StepIcon({ icon }: { icon: Icon }) {
  if (icon === "logo") return <LogoMark className="size-11" />;
  return (
    <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-brand/10 text-brand">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        {ICONS[icon]}
      </svg>
    </span>
  );
}

const ICONS: Record<Exclude<Icon, "logo">, ReactNode> = {
  // Una torta con una porción afuera (el Resumen y sus categorías).
  summary: (
    <>
      <path d="M9 4a6 6 0 1 0 6 6H9V4Z" />
      <path d="M12 2.5A5.5 5.5 0 0 1 17.5 8H12V2.5Z" />
    </>
  ),
  // Un globo de chat, como el aviso de WhatsApp del Resumen.
  whatsapp: (
    <>
      <path d="M10 3.5c-3.9 0-7 2.6-7 5.9 0 1.6.8 3.1 2 4.1L4.5 16.5l3.2-1.4c.7.2 1.5.3 2.3.3 3.9 0 7-2.6 7-5.9S13.9 3.5 10 3.5Z" />
      <path d="M7 9.5h.01M10 9.5h.01M13 9.5h.01" strokeWidth="2" />
    </>
  ),
  // Un calendario (lo que se paga cada mes).
  bills: (
    <>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 2.5v4M13 2.5v4M7 12h2" />
    </>
  ),
  // Barras que suben (cómo te va mes a mes).
  reports: <path d="M3 16.5h14M5.5 13v3.5M10 9v7.5M14.5 5v11.5" />,
};
