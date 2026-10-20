import { render, screen, within, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { Toaster } from "@/components/toaster";
import { InEnglish } from "./locale";

// Para las pruebas de componentes que muestran avisos emergentes: se renderizan dentro del Toaster,
// como en la app (con `wrapper`, así `rerender` lo conserva). Con `english`, la página en inglés.

const ToasterInEnglish = ({ children }: { children: ReactNode }) => (
  <InEnglish>
    <Toaster>{children}</Toaster>
  </InEnglish>
);

export const renderWithToaster = (ui: ReactElement, { english = false, ...options }: Omit<RenderOptions, "wrapper"> & { english?: boolean } = {}) =>
  render(ui, { wrapper: english ? ToasterInEnglish : Toaster, ...options });

// La región de los avisos: "Avisos" en español, "Notices" en inglés.
const region = () => screen.getByRole("region", { name: /^(Avisos|Notices)$/ });

/** El aviso emergente que se ve (espera a que aparezca; falla si hay más de uno). */
export const findToast = () => within(region()).findByRole("listitem");

/** Los avisos emergentes que se ven ahora. */
export const toasts = () => within(region()).queryAllByRole("listitem");
