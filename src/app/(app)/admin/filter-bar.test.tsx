import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_FILTERS, type LogFilters } from "@/modules/admin/log-filters";

// next/form necesita el router de Next: aquí es un <form> común (su envío se espía).
vi.mock("next/form", () => ({
  default: (props: ComponentProps<"form"> & { scroll?: boolean }) => {
    const formProps = { ...props };
    delete formProps.scroll;
    return <form {...formProps} />;
  },
}));

const { FilterBar } = await import("./filter-bar");

const f = (overrides: Partial<LogFilters> = {}): LogFilters => ({ ...NO_FILTERS, ...overrides });
let submitted: FormData[] = [];

beforeEach(() => {
  submitted = [];
  vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(function (this: HTMLFormElement) {
    submitted.push(new FormData(this));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const filtersButton = () => screen.getByRole("button", { name: /^Filtros/ });
const panel = () => document.getElementById(filtersButton().getAttribute("aria-controls")!)!;

describe("FilterBar", () => {
  it("muestra la búsqueda con lo buscado y el panel cerrado, sin contador sin filtros", () => {
    render(<FilterBar filters={f({ search: "ana" })} panelOpen={false} />);
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toHaveValue("ana");
    expect(filtersButton()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toBeVisible();
  });

  it("el botón Filtros dice cuántos hay activos (también para lectores de pantalla)", () => {
    render(<FilterBar filters={f({ types: ["registered", "whatsapp_linked"], date: "7d" })} panelOpen={false} />);
    expect(filtersButton()).toHaveAccessibleName("Filtros (activos: 3)");
  });

  it("abre y cierra el panel; abierto, el formulario pide que vuelva abierto", async () => {
    render(<FilterBar filters={f()} panelOpen={false} />);
    await userEvent.click(filtersButton());
    expect(filtersButton()).toHaveAttribute("aria-expanded", "true");
    expect(panel()).toBeVisible();
    expect(document.querySelector('input[name="panel"]')).toHaveValue("1");

    await userEvent.click(filtersButton());
    expect(panel()).not.toBeVisible();
    expect(document.querySelector('input[name="panel"]')).toBeNull();
  });

  it("los chips reflejan los filtros de la URL", () => {
    render(<FilterBar filters={f({ types: ["whatsapp_linked", "whatsapp_link_failed"], date: "30d" })} panelOpen />);
    expect(screen.getByRole("checkbox", { name: "Vinculaciones" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Intentos fallidos" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Registros" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Últimos 30 días" })).toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("tocar un tipo aplica el filtro al instante, con los demás", async () => {
    render(<FilterBar filters={f({ types: ["registered"], search: "ana" })} panelOpen />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Vinculaciones" }));

    expect(submitted).toHaveLength(1);
    expect(submitted[0].getAll("tipo")).toEqual(["registered", "whatsapp_linked"]);
    expect(submitted[0].get("q")).toBe("ana");
    expect(submitted[0].get("fecha")).toBe("todo");
    expect(submitted[0].get("panel")).toBe("1");
  });

  it("tocar un atajo de fecha aplica el filtro al instante", async () => {
    render(<FilterBar filters={f()} panelOpen />);
    await userEvent.click(screen.getByRole("radio", { name: "Hoy" }));
    expect(submitted).toHaveLength(1);
    expect(submitted[0].get("fecha")).toBe("hoy");
    expect(submitted[0].get("desde")).toBeNull();
  });

  it("Personalizado muestra el rango y espera a 'Aplicar'", async () => {
    render(<FilterBar filters={f()} panelOpen />);
    expect(screen.queryByLabelText("Desde")).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Personalizado" }));
    expect(submitted).toHaveLength(0);
    await userEvent.type(screen.getByLabelText("Desde"), "2026-10-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-10-15");
    expect(submitted).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Aplicar" })).toHaveAttribute("type", "submit");
  });

  it("con un rango personalizado en la URL, lo muestra", () => {
    render(<FilterBar filters={f({ date: "personalizado", from: "2026-10-01", to: "2026-10-15" })} panelOpen />);
    expect(screen.getByRole("radio", { name: "Personalizado" })).toBeChecked();
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-10-15");
  });

  it("escribir en la búsqueda no envía nada hasta Enter", async () => {
    render(<FilterBar filters={f()} panelOpen={false} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar" }), "beto");
    expect(submitted).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Buscar" })).toHaveAttribute("type", "submit");
  });

  it("el formulario va a /admin", () => {
    render(<FilterBar filters={f()} panelOpen={false} />);
    expect(document.querySelector("form")).toHaveAttribute("action", "/admin");
  });
});
