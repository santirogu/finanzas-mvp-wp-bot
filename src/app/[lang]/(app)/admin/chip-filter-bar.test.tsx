import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

// next/form navega con el router de Next: aquí basta un <form> común.
vi.mock("next/form", () => ({
  default: (props: ComponentProps<"form"> & { scroll?: boolean }) => {
    const formProps = { ...props };
    delete formProps.scroll;
    return <form {...formProps} />;
  },
}));

const { ChipFilterBar } = await import("./chip-filter-bar");

function renderBar() {
  render(
    <ChipFilterBar
      action="/admin/usuarios"
      search=""
      searchPlaceholder="Nombre o correo"
      groups={[{ name: "rol", legend: "Rol", type: "radio", options: [{ value: "admin", label: "Admin" }], selected: [] }]}
      activeCount={0}
      panelOpen={false}
    />,
  );
}

describe("ChipFilterBar", () => {
  it("desde la búsqueda, Tab va al botón Filtros: el botón para enviar con Enter no recibe el foco (no se ve)", async () => {
    renderBar();
    await userEvent.click(screen.getByRole("searchbox", { name: "Buscar" }));
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /Filtros/ })).toHaveFocus();
    // Sigue en el formulario para que Enter en la búsqueda lo envíe.
    expect(screen.getByRole("button", { name: "Buscar", hidden: true })).toHaveAttribute("type", "submit");
  });
});
