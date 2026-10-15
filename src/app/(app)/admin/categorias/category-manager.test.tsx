import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedCategory } from "./category-manager";

// Las Server Actions se simulan: aquí se prueba la interfaz. Lo que hacen de verdad se prueba en
// integración y en las E2E.
const actions = vi.hoisted(() => ({
  createCategoryAction: vi.fn(),
  updateCategoryAction: vi.fn(),
  archiveCategoryAction: vi.fn(),
  restoreCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

const { CategoryManager } = await import("./category-manager");

// jsdom no tiene showModal ni close.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
});

const cat = (overrides: Partial<ManagedCategory>): ManagedCategory => ({
  id: "c1",
  name: "Mercado",
  emoji: "🛒",
  archived: false,
  movements: 124,
  isDefault: false,
  ...overrides,
});
const CATEGORIES = [
  cat({ id: "c1" }),
  cat({ id: "c2", name: "Café", emoji: "☕", movements: 0 }),
  cat({ id: "c3", name: "Otros", emoji: "📦", movements: 57, isDefault: true }),
  cat({ id: "c4", name: "Videojuegos", emoji: "🎮", movements: 12, archived: true }),
];

const list = () => within(screen.getByRole("list", { name: "Categorías de egresos" }));
const archivedList = () => within(screen.getByRole("list", { name: "Categorías archivadas de egresos" }));
const dialog = () => screen.getByRole("dialog");
const row = (name: string) => screen.getAllByRole("listitem").find((li) => li.querySelector("p")?.textContent?.startsWith(name))!;

function renderManager(categories = CATEGORIES) {
  render(<CategoryManager type="expense" categories={categories} />);
}

describe("la lista", () => {
  it("muestra las activas con su emoji y cuántos movimientos tienen, y las archivadas aparte", () => {
    renderManager();
    expect(list().getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent)).toEqual(["Mercado", "Café", "OtrosPor defecto"]);
    expect(row("Mercado")).toHaveTextContent("124 movimientos");
    expect(row("Café")).toHaveTextContent("Sin movimientos");
    expect(archivedList().getAllByRole("listitem")).toHaveLength(1);
    expect(row("Videojuegos")).toHaveTextContent("12 movimientos");
    expect(screen.getByRole("heading", { name: "Archivadas" })).toBeInTheDocument();
  });

  it("un movimiento va en singular; sin archivadas no aparece esa sección", () => {
    renderManager([cat({ movements: 1 })]);
    expect(row("Mercado")).toHaveTextContent("1 movimiento");
    expect(screen.queryByRole("heading", { name: "Archivadas" })).toBeNull();
  });

  it("Otros: 'Por defecto', solo se edita (sin archivar ni eliminar)", () => {
    renderManager();
    const otros = within(row("Otros"));
    expect(otros.getByText("Por defecto")).toBeInTheDocument();
    expect(row("Otros")).toHaveTextContent("solo se cambia el emoji");
    expect(otros.getByRole("button", { name: "Editar Otros" })).toBeInTheDocument();
    expect(otros.queryByRole("button", { name: /Más acciones/ })).toBeNull();
  });

  it("'⋯' muestra Archivar y Eliminar (que piden el código) y se vuelve a cerrar", async () => {
    renderManager();
    const more = within(row("Mercado")).getByRole("button", { name: "Más acciones para Mercado" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(more.getAttribute("aria-controls")!)!;
    expect(panel).not.toBeVisible();
    await userEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getAllByRole("button").map((b) => b.textContent)).toEqual(["ArchivarPide el código", "EliminarPide el código"]);
    await userEvent.click(more);
    expect(panel).not.toBeVisible();
  });

  it("las archivadas se restauran sin código, y también se pueden eliminar", async () => {
    actions.restoreCategoryAction.mockResolvedValue({ message: "Se restauró la categoría 🎮 Videojuegos." });
    renderManager();
    const archived = within(row("Videojuegos"));
    expect(archived.queryByRole("button", { name: /Editar/ })).toBeNull();
    await userEvent.click(archived.getByRole("button", { name: "Más acciones para Videojuegos" }));
    expect(archived.getByRole("button", { name: /^Eliminar/ })).toBeInTheDocument();
    expect(archived.queryByRole("button", { name: /^Archivar/ })).toBeNull();

    await userEvent.click(archived.getByRole("button", { name: "Restaurar Videojuegos" }));
    expect(Object.fromEntries(actions.restoreCategoryAction.mock.calls[0][1] as FormData)).toEqual({ id: "c4" });
    expect(await screen.findByRole("status")).toHaveTextContent("Se restauró la categoría 🎮 Videojuegos.");
  });

  it("si restaurar falla, lo dice junto al botón", async () => {
    actions.restoreCategoryAction.mockResolvedValue({ error: "La categoría no está archivada." });
    renderManager();
    await userEvent.click(within(row("Videojuegos")).getByRole("button", { name: "Restaurar Videojuegos" }));
    expect(await within(row("Videojuegos")).findByRole("alert")).toHaveTextContent("La categoría no está archivada.");
  });
});

describe("crear y editar (sin código)", () => {
  it("'Nueva categoría' pide nombre y emoji, con sugerencias, y envía el tipo", async () => {
    actions.createCategoryAction.mockResolvedValue({ message: "Se creó la categoría 🐾 Mascotas." });
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
    expect(dialog()).toHaveAccessibleName("Nueva categoría de egresos");
    expect(within(dialog()).queryByLabelText("Código de Google Authenticator")).toBeNull();
    const name = within(dialog()).getByLabelText("Nombre");
    expect(name).toHaveAttribute("maxlength", "40");
    // El emoji es opcional y explica qué pasa si se deja vacío.
    expect(within(dialog()).getByRole("textbox", { name: "Emoji (opcional)" })).toHaveAccessibleDescription(
      "Toca uno de los sugeridos o escribe otro. Si lo dejas vacío, la categoría se mostrará con un punto (•).",
    );
    await userEvent.type(name, "Mascotas");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Usar 🐾" }));
    expect(within(dialog()).getByRole("textbox", { name: "Emoji (opcional)" })).toHaveValue("🐾");
    expect(within(dialog()).getByRole("button", { name: "Usar 🐾" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear" }));

    expect(Object.fromEntries(actions.createCategoryAction.mock.calls[0][1] as FormData)).toEqual({ type: "expense", name: "Mascotas", emoji: "🐾" });
    expect(await screen.findByRole("status")).toHaveTextContent("Se creó la categoría 🐾 Mascotas.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("editar trae lo de ahora y envía el id; los errores van junto a su campo", async () => {
    actions.updateCategoryAction.mockResolvedValue({ error: "Ya hay una categoría de egresos con ese nombre.", field: "name" });
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "Editar Mercado" }));
    expect(dialog()).toHaveAccessibleName("Editar la categoría Mercado");
    expect(dialog()).toHaveAccessibleDescription(/Los movimientos que ya la usan pasan a verse con el nombre nuevo/);
    const name = within(dialog()).getByLabelText("Nombre");
    expect(name).toHaveValue("Mercado");
    expect(within(dialog()).getByRole("textbox", { name: "Emoji (opcional)" })).toHaveValue("🛒");
    await userEvent.clear(name);
    await userEvent.type(name, "Salud");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Guardar" }));

    expect(Object.fromEntries(actions.updateCategoryAction.mock.calls[0][1] as FormData)).toEqual({ id: "c1", name: "Salud", emoji: "🛒" });
    expect(await within(dialog()).findByText("Ya hay una categoría de egresos con ese nombre.")).toBeInTheDocument();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Ya hay una categoría de egresos con ese nombre.");
  });

  it("el emoji también se puede escribir a mano (y deja de marcar la sugerencia)", async () => {
    actions.createCategoryAction.mockResolvedValue({ message: "Se creó la categoría 🦜 Aves." });
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "Aves");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Usar 🐾" }));
    const emoji = within(dialog()).getByRole("textbox", { name: "Emoji (opcional)" });
    await userEvent.clear(emoji);
    await userEvent.type(emoji, "🦜");
    expect(within(dialog()).getByRole("button", { name: "Usar 🐾" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear" }));
    expect((actions.createCategoryAction.mock.calls[0][1] as FormData).get("emoji")).toBe("🦜");
  });

  it("el error del emoji va junto al emoji", async () => {
    actions.createCategoryAction.mockResolvedValue({ error: "Escribe un solo emoji.", field: "emoji" });
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "X");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear" }));
    expect(await within(dialog()).findByText("Escribe un solo emoji.")).toBeInTheDocument();
    expect(within(dialog()).getByRole("textbox", { name: "Emoji (opcional)" })).toHaveAccessibleDescription(
      "Toca uno de los sugeridos o escribe otro. Si lo dejas vacío, la categoría se mostrará con un punto (•). Escribe un solo emoji.",
    );
  });

  it("a Otros solo se le cambia el emoji: el nombre no se puede editar", async () => {
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "Editar Otros" }));
    expect(within(dialog()).getByLabelText("Nombre")).toHaveAttribute("readonly");
    expect(within(dialog()).getByText('A "Otros" solo se le puede cambiar el emoji.')).toBeInTheDocument();
  });
});

describe("archivar y eliminar (con código)", () => {
  async function openFromMenu(name: string, action: "Archivar" | "Eliminar") {
    await userEvent.click(within(row(name)).getByRole("button", { name: `Más acciones para ${name}` }));
    await userEvent.click(within(row(name)).getByRole("button", { name: new RegExp(`^${action}`) }));
  }

  it("archivar explica qué pasa con sus movimientos y pide el código", async () => {
    actions.archiveCategoryAction.mockResolvedValue({ message: "Se archivó la categoría 🛒 Mercado." });
    renderManager();
    await openFromMenu("Mercado", "Archivar");
    expect(dialog()).toHaveAccessibleName("¿Archivar la categoría Mercado?");
    expect(dialog()).toHaveAccessibleDescription(
      "Dejará de aparecer en los formularios y el bot no la usará. Los 124 movimientos que ya la tienen la conservan. Puedes restaurarla cuando quieras.",
    );
    await userEvent.type(within(dialog()).getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Archivar" }));
    expect(Object.fromEntries(actions.archiveCategoryAction.mock.calls[0][1] as FormData)).toEqual({ id: "c1", code: "123456" });
    expect(await screen.findByRole("status")).toHaveTextContent("Se archivó la categoría 🛒 Mercado.");
  });

  it("archivar una sin movimientos (o con uno) lo dice", async () => {
    renderManager([cat({ movements: 0 }), cat({ id: "c2", name: "Café", movements: 1 })]);
    await openFromMenu("Mercado", "Archivar");
    expect(dialog()).toHaveAccessibleDescription(/No tiene movimientos\./);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    await openFromMenu("Café", "Archivar");
    expect(dialog()).toHaveAccessibleDescription(
      "Dejará de aparecer en los formularios y el bot no la usará. El movimiento que ya la tiene la conserva. Puedes restaurarla cuando quieras.",
    );
  });

  it("eliminar con movimientos avisa que pasarán a Otros (con su emoji) y sugiere archivar", async () => {
    actions.deleteCategoryAction.mockResolvedValue({ error: "El código no es correcto. Te quedan 4 intentos.", field: "code" });
    renderManager();
    await openFromMenu("Mercado", "Eliminar");
    expect(dialog()).toHaveAccessibleName("¿Eliminar la categoría Mercado?");
    expect(dialog()).toHaveAccessibleDescription(
      "Tiene 124 movimientos. Si la eliminas, pasarán a 📦 Otros. La eliminación queda en el registro de cambios y no se puede deshacer. Si solo quieres que no se use más, archívala: los movimientos la conservan.",
    );
    const submit = within(dialog()).getByRole("button", { name: "Eliminar y pasar a Otros" });
    await userEvent.type(within(dialog()).getByLabelText("Código de Google Authenticator"), "000000");
    await userEvent.click(submit);
    expect(Object.fromEntries(actions.deleteCategoryAction.mock.calls[0][1] as FormData)).toEqual({ id: "c1", code: "000000" });
    expect(await within(dialog()).findByText("El código no es correcto. Te quedan 4 intentos.")).toBeInTheDocument();
  });

  it("eliminar sin movimientos no avisa de Otros; una archivada no sugiere archivar", async () => {
    renderManager();
    await openFromMenu("Café", "Eliminar");
    expect(dialog()).toHaveAccessibleDescription("No tiene movimientos. La eliminación queda en el registro de cambios y no se puede deshacer.");
    expect(within(dialog()).getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancelar" }));

    await openFromMenu("Videojuegos", "Eliminar");
    expect(dialog()).toHaveAccessibleDescription(
      "Tiene 12 movimientos. Si la eliminas, pasarán a 📦 Otros. La eliminación queda en el registro de cambios y no se puede deshacer.",
    );
  });

  it("al abrir otra acción, el aviso anterior se va", async () => {
    actions.archiveCategoryAction.mockResolvedValue({ message: "Se archivó la categoría 🛒 Mercado." });
    renderManager();
    await openFromMenu("Mercado", "Archivar");
    await userEvent.type(within(dialog()).getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Archivar" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
