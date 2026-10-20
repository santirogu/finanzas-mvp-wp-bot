import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Buttons, Dialog, FormError, openAsModal } from "./dialog";

// Las ventanas modales de la app (la administración, "Registrar pago" del Resumen).

// jsdom no abre ventanas modales: basta con marcarla abierta y avisar al cerrarla.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

describe("Dialog", () => {
  it("se abre como modal al montarse, con su título como nombre y lo que se marque como descripción", () => {
    render(
      <Dialog title="Registrar el pago de Arriendo" onClose={() => {}}>
        {(ids) => <p id={ids.description}>Categoría: Vivienda.</p>}
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Registrar el pago de Arriendo" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAccessibleDescription("Categoría: Vivienda.");
    expect(screen.getByRole("heading", { level: 2, name: "Registrar el pago de Arriendo" })).toBeVisible();
  });

  it("Cancelar la cierra y avisa (onClose)", async () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Suspender" onClose={onClose}>
        {() => (
          <form>
            <Buttons submit="Suspender" pending="Suspendiendo…" busy={false} danger />
          </form>
        )}
      </Dialog>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
  });

  it("openAsModal no la vuelve a abrir si ya está abierta (ni falla sin ventana)", () => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    showModal.mockClear();
    openAsModal(dialog);
    openAsModal(null);
    expect(showModal).not.toHaveBeenCalled();
  });
});

describe("Buttons", () => {
  it("el que envía, en el color de su acción (rojo si no se deshace); mientras envía, espera", () => {
    const { rerender } = render(<Buttons submit="Guardar" pending="Guardando…" busy={false} />);
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveClass("btn-primary", "min-h-11");
    rerender(<Buttons submit="Eliminar" pending="Eliminando…" busy danger />);
    expect(screen.getByRole("button", { name: "Eliminando…" })).toHaveClass("btn-danger");
    expect(screen.getByRole("button", { name: "Eliminando…" })).toBeDisabled();
    rerender(<Buttons submit="Eliminar" pending="Eliminando…" busy={false} disabled />);
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeDisabled();
  });
});

describe("FormError", () => {
  it("muestra solo los errores generales: los de un campo van junto a él", () => {
    const { rerender, container } = render(<FormError state={{ error: "No encontramos ese gasto." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No encontramos ese gasto.");
    rerender(<FormError state={{ error: "Ingresa un monto", field: "amount" }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FormError state={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
