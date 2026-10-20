import type { ReactNode } from "react";
import { LocaleProvider } from "@/i18n/client";

// Para las pruebas de componentes en inglés: `render(ui, { wrapper: InEnglish })`, como si el layout
// (src/app/[lang]/layout.tsx) hubiera armado la página en inglés. Sin él, los componentes salen en español.
export function InEnglish({ children }: { children: ReactNode }) {
  return <LocaleProvider locale="en">{children}</LocaleProvider>;
}
