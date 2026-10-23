import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollToHash } from "./scroll-to-hash";

// jsdom no tiene scrollIntoView: se simula para ver a qué sección baja.
const scrolled = vi.fn();
Element.prototype.scrollIntoView = function (this: Element) {
  scrolled(this.id);
};

afterEach(() => {
  scrolled.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("ScrollToHash", () => {
  it("baja hasta la sección del ancla cuando ya está", () => {
    window.history.replaceState(null, "", "/reportes#categorias");
    render(
      <>
        <section id="categorias" />
        <ScrollToHash />
      </>,
    );
    expect(scrolled).toHaveBeenCalledWith("categorias");
  });

  it("sin ancla, o con una que no existe, no hace nada", () => {
    render(<ScrollToHash />);
    window.history.replaceState(null, "", "/reportes#nada");
    render(<ScrollToHash />);
    expect(scrolled).not.toHaveBeenCalled();
  });
});
