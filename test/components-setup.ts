// Se ejecuta antes de cada archivo de pruebas de componentes: agrega los matchers de jest-dom
// (toBeVisible, toHaveValue, …) y desmonta lo renderizado entre pruebas.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Los componentes de servidor leen el idioma del segmento [lang] (next/root-params), que solo existe al
// compilar con Next: en las pruebas, español (src/i18n/server.test.ts prueba la lectura).
vi.mock("next/root-params", () => ({ lang: async () => "es" }));

// jsdom no trae las ventanas modales (<dialog>.showModal): se simulan como en el navegador.
// - Abrir la marca abierta y enfoca su control con autofocus o, si no hay, el primero que se pueda enfocar: el
//   autoFocus de React corre justo antes, con la ventana todavía cerrada, y jsdom, como el navegador, no enfoca un
//   campo que no se ve.
// - Cerrar devuelve el foco a lo que lo tenía antes de abrir y avisa con el evento close.
// dialog.test.tsx la reemplaza para contar las llamadas.
const FOCUSABLE = "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
const focusedBefore = new WeakMap<HTMLDialogElement, Element | null>();
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  focusedBefore.set(this, document.activeElement);
  this.setAttribute("open", "");
  (this.querySelector<HTMLElement>("[autofocus]") ?? this.querySelector<HTMLElement>(FOCUSABLE))?.focus();
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.removeAttribute("open");
  const before = focusedBefore.get(this);
  if (before instanceof HTMLElement) before.focus();
  this.dispatchEvent(new Event("close"));
};
