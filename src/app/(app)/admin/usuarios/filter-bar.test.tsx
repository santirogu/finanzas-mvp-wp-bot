import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_USER_FILTERS, type UserFilters } from "@/modules/admin/users/user-filters";

// next/form necesita el router de Next: aquí es un <form> común (su envío se espía).
vi.mock("next/form", () => ({
  default: (props: ComponentProps<"form"> & { scroll?: boolean }) => {
    const formProps = { ...props };
    delete formProps.scroll;
    return <form {...formProps} />;
  },
}));

const { UsersFilterBar } = await import("./filter-bar");

const f = (overrides: Partial<UserFilters> = {}): UserFilters => ({ ...NO_USER_FILTERS, ...overrides });
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
const group = (name: string) => within(screen.getByRole("group", { name }));

describe("UsersFilterBar", () => {
  it("el formulario va a /admin/usuarios, con la búsqueda y el panel cerrado", () => {
    render(<UsersFilterBar filters={f({ search: "ana" })} panelOpen={false} />);
    expect(document.querySelector("form")).toHaveAttribute("action", "/admin/usuarios");
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toHaveValue("ana");
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toHaveAttribute("placeholder", "Nombre, correo o número");
    // La búsqueda cuenta como filtro activo (como en el Historial).
    expect(filtersButton()).toHaveAccessibleName("Filtros (activos: 1)");
    expect(filtersButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("sin filtros, el botón no tiene contador", () => {
    render(<UsersFilterBar filters={f()} panelOpen={false} />);
    expect(filtersButton()).toHaveAccessibleName("Filtros");
  });

  it("el botón Filtros cuenta cada filtro activo", () => {
    render(
      <UsersFilterBar
        filters={f({ search: "ana", role: "admin", whatsapp: false, locked: true, date: "7d" })}
        panelOpen={false}
      />,
    );
    expect(filtersButton()).toHaveAccessibleName("Filtros (activos: 5)");
  });

  it("tiene los grupos Rol, WhatsApp, Estado y Fecha de registro, con Todos marcado al empezar", () => {
    render(<UsersFilterBar filters={f()} panelOpen />);
    expect(screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent)).toEqual([
      "Rol",
      "WhatsApp",
      "Estado",
      "Fecha de registro",
    ]);
    expect(group("Rol").getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual(["Todos", "Admin", "Usuario"]);
    expect(group("Rol").getByRole("radio", { name: "Todos" })).toBeChecked();
    expect(group("WhatsApp").getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual([
      "Todos",
      "Vinculado",
      "Sin vincular",
    ]);
    expect(group("WhatsApp").getByRole("radio", { name: "Todos" })).toBeChecked();
    expect(group("Estado").getByRole("checkbox", { name: "Inicio de sesión bloqueado" })).not.toBeChecked();
    expect(group("Fecha de registro").getByRole("radio", { name: "Todo" })).toBeChecked();
  });

  it("los chips reflejan los filtros de la URL", () => {
    render(<UsersFilterBar filters={f({ role: "user", whatsapp: true, locked: true, date: "30d" })} panelOpen />);
    expect(group("Rol").getByRole("radio", { name: "Usuario" })).toBeChecked();
    expect(group("WhatsApp").getByRole("radio", { name: "Vinculado" })).toBeChecked();
    expect(group("Estado").getByRole("checkbox", { name: "Inicio de sesión bloqueado" })).toBeChecked();
    expect(group("Fecha de registro").getByRole("radio", { name: "Últimos 30 días" })).toBeChecked();
  });

  it("sin vincular también se refleja", () => {
    render(<UsersFilterBar filters={f({ whatsapp: false })} panelOpen />);
    expect(group("WhatsApp").getByRole("radio", { name: "Sin vincular" })).toBeChecked();
  });

  it("tocar un rol aplica el filtro al instante, con los demás", async () => {
    render(<UsersFilterBar filters={f({ search: "ana", whatsapp: true })} panelOpen />);
    await userEvent.click(group("Rol").getByRole("radio", { name: "Admin" }));

    expect(submitted).toHaveLength(1);
    expect(Object.fromEntries(submitted[0])).toEqual({
      q: "ana",
      panel: "1",
      rol: "admin",
      whatsapp: "si",
      fecha: "todo",
    });
  });

  it("el chip de bloqueo y los de WhatsApp también aplican al instante", async () => {
    render(<UsersFilterBar filters={f()} panelOpen />);
    await userEvent.click(group("Estado").getByRole("checkbox", { name: "Inicio de sesión bloqueado" }));
    await userEvent.click(group("WhatsApp").getByRole("radio", { name: "Sin vincular" }));
    expect(submitted.map((data) => [data.get("estado"), data.get("whatsapp")])).toEqual([
      ["bloqueadas", "todos"],
      ["bloqueadas", "no"],
    ]);
  });

  it("la fecha de registro personalizada espera a 'Aplicar'", async () => {
    render(<UsersFilterBar filters={f()} panelOpen />);
    await userEvent.click(group("Fecha de registro").getByRole("radio", { name: "Personalizado" }));
    expect(submitted).toHaveLength(0);
    expect(screen.getByLabelText("Desde")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar" })).toHaveAttribute("type", "submit");
  });
});
