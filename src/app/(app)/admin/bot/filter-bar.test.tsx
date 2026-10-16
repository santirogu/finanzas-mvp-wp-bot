import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_BOT_FILTERS, type BotFilters } from "@/modules/admin/bot/bot-filters";

// next/form necesita el router de Next: aquí es un <form> común (su envío se espía).
vi.mock("next/form", () => ({
  default: (props: ComponentProps<"form"> & { scroll?: boolean }) => {
    const formProps = { ...props };
    delete formProps.scroll;
    return <form {...formProps} />;
  },
}));

const { BotFilterBar } = await import("./filter-bar");

const f = (overrides: Partial<BotFilters> = {}): BotFilters => ({ ...NO_BOT_FILTERS, ...overrides });
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

describe("BotFilterBar", () => {
  it("muestra la búsqueda con lo buscado, sin contador sin filtros", () => {
    render(<BotFilterBar filters={f({ search: "ana" })} panelOpen={false} />);
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toHaveValue("ana");
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toHaveAttribute("placeholder", "Nombre, correo o número");
    expect(filtersButton()).toHaveAccessibleName("Filtros");
  });

  it("la fecha cuenta como un filtro activo", () => {
    render(<BotFilterBar filters={f({ date: "7d" })} panelOpen={false} />);
    expect(filtersButton()).toHaveAccessibleName("Filtros (activos: 1)");
  });

  it("solo filtra por la fecha de los mensajes, y el chip refleja la URL", () => {
    render(<BotFilterBar filters={f({ date: "30d" })} panelOpen />);
    expect(screen.getByRole("group", { name: "Fecha de los mensajes" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Últimos 30 días" })).toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("tocar un atajo de fecha aplica el filtro al instante, con la búsqueda", async () => {
    render(<BotFilterBar filters={f({ search: "beto" })} panelOpen />);
    await userEvent.click(screen.getByRole("radio", { name: "Hoy" }));
    expect(submitted).toHaveLength(1);
    expect(submitted[0].get("fecha")).toBe("hoy");
    expect(submitted[0].get("q")).toBe("beto");
  });

  it("el formulario va a /admin/bot", () => {
    render(<BotFilterBar filters={f()} panelOpen={false} />);
    expect(document.querySelector("form")).toHaveAttribute("action", "/admin/bot");
  });
});
