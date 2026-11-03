"use client";

import { useState } from "react";
import { WelcomeTutorial, type TutorialValues } from "@/components/welcome-tutorial";
import { useTexts } from "@/i18n/client";
import { texts } from "@/i18n/texts";

const TEXTS = texts({ open: "Ver el tutorial de bienvenida" }, { en: { open: "See the welcome tutorial" } });

/** En Ayuda: vuelve a abrir el tutorial de bienvenida, las veces que quiera (no cambia nada de la cuenta). */
export function TutorialButton({ values }: { values: TutorialValues }) {
  const t = useTexts(TEXTS);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface pointer-fine:min-h-9"
      >
        {t.open}
      </button>
      {open && <WelcomeTutorial values={values} onClose={() => setOpen(false)} />}
    </>
  );
}
