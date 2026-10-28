import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_USER_FILTERS, type UserFilters } from "@/modules/admin/users/user-filters";
import { InEnglish } from "../../../../../../test/locale";

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
    expect(filtersButton()).toHaveAccessibleName("Filtros: 1 activo");
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
    expect(filtersButton()).toHaveAccessibleName("Filtros: 5 activos");
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
    expect(group("Estado").getByRole("checkbox", { name: "Suspendidas" })).not.toBeChecked();
    expect(group("Fecha de registro").getByRole("radio", { name: "Todo" })).toBeChecked();
  });

  it("los chips reflejan los filtros de la URL", () => {
    render(<UsersFilterBar filters={f({ role: "user", whatsapp: true, locked: true, date: "30d" })} panelOpen />);
    expect(group("Rol").getByRole("radio", { name: "Usuario" })).toBeChecked();
    expect(group("WhatsApp").getByRole("radio", { name: "Vinculado" })).toBeChecked();
    expect(group("Estado").getByRole("checkbox", { name: "Inicio de sesión bloqueado" })).toBeChecked();
    expect(group("Fecha de registro").getByRole("radio", { name: "Últimos 30 días" })).toBeChecked();
  });

  it("el chip de suspendidas se refleja y se combina con el de bloqueo", async () => {
    render(<UsersFilterBar filters={f({ suspended: true })} panelOpen />);
    expect(group("Estado").getByRole("checkbox", { name: "Suspendidas" })).toBeChecked();
    await userEvent.click(group("Estado").getByRole("checkbox", { name: "Inicio de sesión bloqueado" }));
    expect(submitted[0].getAll("estado")).toEqual(["bloqueadas", "suspendidas"]);
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

  it("un atajo de fecha de registro aplica al instante, con los demás filtros", async () => {
    render(<UsersFilterBar filters={f({ role: "admin", locked: true })} panelOpen />);
    await userEvent.click(group("Fecha de registro").getByRole("radio", { name: "Últimos 7 días" }));
    expect(submitted).toHaveLength(1);
    expect(Object.fromEntries(submitted[0])).toMatchObject({ fecha: "7d", rol: "admin", estado: "bloqueadas" });
    expect(submitted[0].get("desde")).toBeNull();
  });

  it("'Todos' quita el filtro de rol o de WhatsApp", async () => {
    render(<UsersFilterBar filters={f({ role: "user", whatsapp: true })} panelOpen />);
    await userEvent.click(group("Rol").getByRole("radio", { name: "Todos" }));
    await userEvent.click(group("WhatsApp").getByRole("radio", { name: "Todos" }));
    expect(submitted.map((data) => [data.get("rol"), data.get("whatsapp")])).toEqual([
      ["todos", "si"],
      ["todos", "todos"],
    ]);
  });

  it("quitar la marca de bloqueo también aplica al instante", async () => {
    render(<UsersFilterBar filters={f({ locked: true })} panelOpen />);
    await userEvent.click(group("Estado").getByRole("checkbox", { name: "Inicio de sesión bloqueado" }));
    expect(submitted).toHaveLength(1);
    expect(submitted[0].get("estado")).toBeNull();
  });

  it("la fecha de registro personalizada espera a 'Aplicar'", async () => {
    render(<UsersFilterBar filters={f()} panelOpen />);
    await userEvent.click(group("Fecha de registro").getByRole("radio", { name: "Personalizado" }));
    expect(submitted).toHaveLength(0);
    expect(screen.getByLabelText("Desde")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar" })).toHaveAttribute("type", "submit");
  });
});

describe("UsersFilterBar en inglés", () => {
  it("la búsqueda, el botón, los grupos y sus chips", () => {
    render(<UsersFilterBar filters={f({ search: "ana", role: "user", suspended: true })} panelOpen />, { wrapper: InEnglish });
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveAttribute("placeholder", "Name, email or number");
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAccessibleName("Filters: 3 active");
    expect(screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent)).toEqual([
      "Role",
      "WhatsApp",
      "Status",
      "Sign-up date",
    ]);
    expect(group("Role").getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual(["All", "Admin", "User"]);
    expect(group("Role").getByRole("radio", { name: "User" })).toBeChecked();
    expect(group("WhatsApp").getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual(["All", "Linked", "Not linked"]);
    expect(group("Status").getByRole("checkbox", { name: "Sign-in locked" })).not.toBeChecked();
    expect(group("Status").getByRole("checkbox", { name: "Suspended" })).toBeChecked();
    expect(group("Sign-up date").getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual([
      "All",
      "Today",
      "Last 7 days",
      "Last 30 days",
      "Custom",
    ]);
  });

  it("el rango personalizado: Desde, Hasta y Aplicar", async () => {
    render(<UsersFilterBar filters={f()} panelOpen />, { wrapper: InEnglish });
    await userEvent.click(group("Sign-up date").getByRole("radio", { name: "Custom" }));
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toHaveAttribute("type", "submit");
  });
});
