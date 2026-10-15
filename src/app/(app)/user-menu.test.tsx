import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/session";

// UserMenu es un componente de servidor: se ejecuta como función y se dibuja lo que devuelve.
const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn(async () => session.user) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { UserMenu } = await import("./user-menu");

const ANA: CurrentUser = {
  id: "u1",
  name: "Ana Pérez",
  email: "ana@test.local",
  timezone: "America/Bogota",
  currency: "COP",
  role: "user",
};

beforeEach(() => {
  session.user = ANA;
});

describe("UserMenu", () => {
  it("a un usuario le muestra su nombre, Mi cuenta y Salir, sin la etiqueta de admin", async () => {
    const { container } = render(await UserMenu());
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/cuenta");
    expect(screen.getByRole("button", { name: "Salir" })).toBeVisible();
    expect(screen.queryByText("Admin")).toBeNull();
    expect(container.innerHTML).not.toMatch(/admin/i);
  });

  it("a un admin le muestra la etiqueta Admin junto al nombre", async () => {
    session.user = { ...ANA, role: "admin" };
    render(await UserMenu());
    const badge = screen.getByText("Admin");
    expect(badge).toBeVisible();
    // Fuera del nombre, que en celular se oculta: la etiqueta se ve en todos los tamaños.
    expect(badge.className).not.toMatch(/\bhidden\b/);
    expect(screen.getByText("Ana Pérez").nextElementSibling).toBe(badge);
  });
});
