import { render, screen, within, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { Toaster } from "@/components/toaster";

// Para las pruebas de componentes que muestran avisos emergentes: se renderizan dentro del Toaster,
// como en la app (con `wrapper`, así `rerender` lo conserva).

export const renderWithToaster = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  render(ui, { wrapper: Toaster, ...options });

const region = () => screen.getByRole("region", { name: "Avisos" });

/** El aviso emergente que se ve (espera a que aparezca; falla si hay más de uno). */
export const findToast = () => within(region()).findByRole("listitem");

/** Los avisos emergentes que se ven ahora. */
export const toasts = () => within(region()).queryAllByRole("listitem");
