import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/session";

// UserMenu es un componente de servidor: se ejecuta como función y se dibuja lo que devuelve.
const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(async () => session.user) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), usePathname: () => "/dashboard" }));

const { UserMenu } = await import("./user-menu");

const ANA: CurrentUser = {
  id: "u1",
  name: "Ana Pérez",
  email: "ana@test.local",
  timezone: "America/Bogota",
  currency: "COP",
  role: "user",
  twoFactorEnabled: false,
};

beforeEach(() => {
  session.user = ANA;
});

describe("UserMenu", () => {
  it("a un usuario: el menú de su cuenta, sin nada de admin (ni en el HTML)", async () => {
    const { container } = render(await UserMenu());
    expect(screen.getByRole("button", { name: "Tu cuenta: Ana Pérez" })).toHaveTextContent("AP");
    await userEvent.click(screen.getByRole("button", { name: /^Tu cuenta/ }));
    expect(screen.getByText("ana@test.local")).toBeVisible();
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/cuenta");
    expect(screen.getByRole("button", { name: "Salir" })).toBeVisible();
    expect(screen.queryByText("Admin")).toBeNull();
    expect(container.innerHTML).not.toMatch(/admin/i);
  });

  it("a un admin: el escudo en el círculo (también en celular) y la etiqueta Admin en la tarjeta", async () => {
    session.user = { ...ANA, role: "admin" };
    const { container } = render(await UserMenu());
    expect(screen.getByRole("button", { name: "Tu cuenta: Ana Pérez, admin" })).toBeVisible();
    const shield = container.querySelector("[data-admin-shield]");
    expect(shield).not.toBeNull();
    // El escudo está en el círculo, que se ve en todos los tamaños (no se oculta en celular).
    expect(shield!.closest("button")?.className).not.toMatch(/\bhidden\b/);
    await userEvent.click(screen.getByRole("button", { name: /^Tu cuenta/ }));
    expect(screen.getByText("Admin")).toBeVisible();
  });
});
