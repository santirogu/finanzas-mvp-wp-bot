import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El reloj se simula para probar cuánto dura cada aviso; el router, para ver cómo limpia la URL.
const navigation = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/egresos", search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const { MAX_TOASTS, TOAST_MS, TOAST_WITH_ACTION_MS, ToastOnLoad, Toaster, UrlToasts, useToast } = await import("./toaster");
type Toast = Parameters<ReturnType<typeof useToast>>[0];

/** Un botón que muestra el aviso, dentro del Toaster (como en la app). */
function Trigger({ toast, label = "Mostrar" }: { toast: Toast; label?: string }) {
  const show = useToast();
  return (
    <button type="button" onClick={() => show(toast)}>
      {label}
    </button>
  );
}

function renderWith(...toasts: Toast[]) {
  return render(
    <Toaster>
      <main id="contenido" tabIndex={-1}>
        {toasts.map((toast, i) => (
          <Trigger key={i} toast={toast} label={`Mostrar ${i + 1}`} />
        ))}
      </main>
    </Toaster>,
  );
}

const click = (name: string) => act(() => fireEvent.click(screen.getByRole("button", { name })));
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const region = () => screen.getByRole("region", { name: "Avisos" });
const toasts = () => region().querySelectorAll("li");

beforeEach(() => {
  vi.useFakeTimers();
  navigation.replace.mockReset();
  navigation.pathname = "/egresos";
  navigation.search = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Toaster", () => {
  it("la región de los avisos existe siempre (vacía), para que el lector de pantalla anuncie lo que entra", () => {
    renderWith();
    expect(region().querySelector("[aria-live=polite]")).toBeInTheDocument();
    expect(toasts()).toHaveLength(0);
  });

  it("muestra el aviso con su color y se va solo a los 4 segundos", async () => {
    renderWith({ tone: "success", message: "Egreso registrado" });
    await click("Mostrar 1");

    expect(screen.getByText("Egreso registrado")).toBeVisible();
    expect(toasts()[0]).toHaveAttribute("data-tone", "success");
    expect(TOAST_MS).toBe(4000);
    await wait(TOAST_MS - 1);
    expect(screen.getByText("Egreso registrado")).toBeVisible();
    await wait(1);
    expect(screen.queryByText("Egreso registrado")).toBeNull();
  });

  it("los rojos (lo que se borró o se desactivó) también", async () => {
    renderWith({ tone: "removal", message: "Cuenta suspendida" });
    await click("Mostrar 1");
    expect(toasts()[0]).toHaveAttribute("data-tone", "removal");
  });

  it("se cierra antes con la X", async () => {
    renderWith({ tone: "success", message: "Cambios guardados" });
    await click("Mostrar 1");
    await click("Cerrar el aviso");
    expect(screen.queryByText("Cambios guardados")).toBeNull();
  });

  it("con el mouse (o el dedo) encima se pausa, y al salir sigue con lo que le quedaba", async () => {
    renderWith({ tone: "success", message: "Cambios guardados" });
    await click("Mostrar 1");
    await wait(3000);
    act(() => fireEvent.pointerEnter(toasts()[0]));
    await wait(20_000);
    expect(screen.getByText("Cambios guardados")).toBeVisible();

    act(() => fireEvent.pointerLeave(toasts()[0]));
    await wait(999);
    expect(screen.getByText("Cambios guardados")).toBeVisible();
    await wait(1);
    expect(screen.queryByText("Cambios guardados")).toBeNull();
  });

  it("con el foco del teclado adentro también se pausa", async () => {
    renderWith({ tone: "success", message: "Cambios guardados" });
    await click("Mostrar 1");
    act(() => {
      fireEvent.keyDown(document, { key: "Tab" });
      screen.getByRole("button", { name: "Cerrar el aviso" }).focus();
    });
    await wait(20_000);
    expect(screen.getByText("Cambios guardados")).toBeVisible();

    act(() => screen.getByRole("button", { name: "Mostrar 1" }).focus());
    await wait(TOAST_MS);
    expect(screen.queryByText("Cambios guardados")).toBeNull();
  });

  it("un foco que llega después de un clic no lo pausa: con el mouse se va a su tiempo", async () => {
    renderWith({ tone: "removal", message: "Se borró «Mercado»", focus: true });
    act(() => fireEvent.pointerDown(document.body));
    await click("Mostrar 1");
    expect(toasts()[0]).toHaveFocus();
    await wait(TOAST_MS);
    expect(screen.queryByText("Se borró «Mercado»")).toBeNull();
    expect(document.getElementById("contenido")).toHaveFocus();
  });

  it("uno con botón ('Deshacer') dura 10 segundos; el botón envía sus datos y cierra el aviso", async () => {
    const restore = vi.fn();
    renderWith({
      tone: "removal",
      message: "Se borró «Mercado»",
      action: { label: "Deshacer", formAction: restore, fields: { id: "tx-1" } },
    });
    await click("Mostrar 1");
    expect(TOAST_WITH_ACTION_MS).toBe(10_000);
    await wait(TOAST_MS);
    expect(screen.getByText("Se borró «Mercado»")).toBeVisible();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Deshacer" })));

    expect(restore).toHaveBeenCalledOnce();
    expect(Object.fromEntries(restore.mock.calls[0][0])).toEqual({ id: "tx-1" });
    expect(screen.queryByText("Se borró «Mercado»")).toBeNull();
  });

  it("sin tocar el botón, se va a los 10 segundos", async () => {
    renderWith({ tone: "removal", message: "Se borró «Mercado»", action: { label: "Deshacer", formAction: vi.fn(), fields: {} } });
    await click("Mostrar 1");
    await wait(TOAST_WITH_ACTION_MS - 1);
    expect(screen.getByText("Se borró «Mercado»")).toBeVisible();
    await wait(1);
    expect(screen.queryByText("Se borró «Mercado»")).toBeNull();
  });

  it("si lo pide, recibe el foco; al cerrarse con el foco adentro, el foco vuelve al contenido", async () => {
    renderWith({ tone: "removal", message: "Se borró «Mercado»", focus: true });
    await click("Mostrar 1");
    expect(toasts()[0]).toHaveFocus();

    await click("Cerrar el aviso");
    expect(document.getElementById("contenido")).toHaveFocus();
  });

  it("no repite un aviso con el mismo id mientras se ve", async () => {
    renderWith({ id: "borrado:1", tone: "removal", message: "Se borró «Mercado»" });
    await click("Mostrar 1");
    await click("Mostrar 1");
    expect(toasts()).toHaveLength(1);
  });

  it("muestra hasta 3 a la vez: al llegar otro se va el más viejo", async () => {
    renderWith(...["Uno", "Dos", "Tres", "Cuatro"].map((message) => ({ tone: "success" as const, message })));
    for (const n of [1, 2, 3, 4]) await click(`Mostrar ${n}`);
    expect(MAX_TOASTS).toBe(3);
    expect([...toasts()].map((li) => li.textContent)).toEqual(["Dos", "Tres", "Cuatro"]);
  });

  it("fuera del Toaster, useToast no hace nada (no rompe)", () => {
    render(<Trigger toast={{ tone: "success", message: "Nada" }} />);
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Mostrar" }))).not.toThrow();
  });
});

describe("UrlToasts", () => {
  const renderUrl = () =>
    render(
      <Toaster>
        <UrlToasts />
      </Toaster>,
    );

  it("muestra el aviso que pide ?aviso= y lo quita de la dirección (sin tocar lo demás)", () => {
    navigation.search = "mes=2026-09&aviso=guardado";
    renderUrl();
    expect(screen.getByText("Cambios guardados")).toBeVisible();
    expect(toasts()[0]).toHaveAttribute("data-tone", "success");
    expect(navigation.replace).toHaveBeenCalledWith("/egresos?mes=2026-09", { scroll: false });
  });

  it("un código de otra página no se muestra (un enlace no puede inventar un aviso)", () => {
    navigation.pathname = "/dashboard";
    navigation.search = "aviso=cuenta-eliminada";
    renderUrl();
    expect(toasts()).toHaveLength(0);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("con un código que no conoce, o sin ?aviso=, no hace nada", () => {
    for (const search of ["aviso=hackeado", "mes=2026-09", ""]) {
      navigation.search = search;
      const { unmount } = renderUrl();
      expect(toasts()).toHaveLength(0);
      unmount();
    }
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe("ToastOnLoad", () => {
  it("muestra el aviso que arma el servidor y deja la dirección limpia", () => {
    render(
      <Toaster>
        <ToastOnLoad cleanHref="/egresos?mes=2026-09" toast={{ id: "restaurado:1", tone: "success", message: "Se restauró «Mercado»" }} />
      </Toaster>,
    );
    expect(screen.getByText("Se restauró «Mercado»")).toBeVisible();
    expect(navigation.replace).toHaveBeenCalledWith("/egresos?mes=2026-09", { scroll: false });
  });
});
