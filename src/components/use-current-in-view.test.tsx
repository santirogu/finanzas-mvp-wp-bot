import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCurrentInView } from "./use-current-in-view";

// jsdom no calcula posiciones: cada prueba dice dónde termina la franja y dónde la sección actual.
const rect = (right: number) => ({ right }) as DOMRect;

function Strip({ pathname, current = true }: { pathname: string; current?: boolean }) {
  const ref = useCurrentInView(pathname);
  return (
    <nav ref={ref} data-testid="franja">
      <a href="/a">A</a>
      <a href="/b" aria-current={current ? "page" : undefined}>
        B
      </a>
    </nav>
  );
}

function place({ bar, item }: { bar: number; item: number }) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return rect(this.tagName === "NAV" ? bar : item);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCurrentInView", () => {
  it("si la sección actual queda cortada, desliza la franja hasta mostrarla (y un poco más)", () => {
    place({ bar: 343, item: 380 });
    const { getByTestId } = render(<Strip pathname="/b" />);
    expect(getByTestId("franja").scrollLeft).toBe(37 + 16);
  });

  it("si ya se ve entera, no mueve nada", () => {
    place({ bar: 343, item: 343 });
    const { getByTestId } = render(<Strip pathname="/b" />);
    expect(getByTestId("franja").scrollLeft).toBe(0);
  });

  it("sin sección actual, no mueve nada", () => {
    place({ bar: 343, item: 900 });
    const { getByTestId } = render(<Strip pathname="/otra" current={false} />);
    expect(getByTestId("franja").scrollLeft).toBe(0);
  });

  it("vuelve a mirar al cambiar el ancho (girar el celular) y deja de mirar al salir", () => {
    place({ bar: 800, item: 300 });
    const { getByTestId, unmount } = render(<Strip pathname="/b" />);
    const strip = getByTestId("franja");
    expect(strip.scrollLeft).toBe(0);

    place({ bar: 343, item: 360 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(strip.scrollLeft).toBe(17 + 16);

    const remove = vi.spyOn(window, "removeEventListener");
    unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("vuelve a mirar al cambiar de página", () => {
    place({ bar: 800, item: 300 });
    const { getByTestId, rerender } = render(<Strip pathname="/a" />);
    place({ bar: 343, item: 353 });
    rerender(<Strip pathname="/b" />);
    expect(getByTestId("franja").scrollLeft).toBe(10 + 16);
  });
});
