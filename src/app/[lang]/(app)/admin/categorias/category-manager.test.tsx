import { screen, within } from "@testing-library/react";
import { findToast, renderWithToaster as render, toasts } from "../../../../../../test/toaster";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset();
});

const cat = (overrides: Partial<ManagedCategory>): ManagedCategory => ({
  id: "c1",
  name: "Mercado",
  nameEn: null,
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
    expect(row("Otros")).toHaveTextContent("su nombre no se cambia");
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

  it("'⋯' se cierra con Esc (y el foco vuelve a él) y al tocar afuera", async () => {
    renderManager();
    const more = within(row("Mercado")).getByRole("button", { name: "Más acciones para Mercado" });
    const panel = document.getElementById(more.getAttribute("aria-controls")!)!;
    await userEvent.click(more);
    await userEvent.tab();
    expect(within(panel).getByRole("button", { name: /^Archivar/ })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(panel).not.toBeVisible();
    expect(more).toHaveFocus();

    await userEvent.click(more);
    await userEvent.click(screen.getByRole("list", { name: "Categorías de egresos" }));
    expect(panel).not.toBeVisible();
  });

  it("al elegir una acción del '⋯', el foco pasa al '⋯': el navegador lo devuelve ahí al cancelar la ventana", async () => {
    renderManager();
    const more = within(row("Mercado")).getByRole("button", { name: "Más acciones para Mercado" });
    await userEvent.click(more);
    await userEvent.click(within(row("Mercado")).getByRole("button", { name: /^Archivar/ }));
    // Abierta, el foco está en la ventana; al cancelarla vuelve al '⋯' (no al menú, que ya se cerró).
    expect(dialog()).toContainElement(document.activeElement as HTMLElement);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(more).toHaveFocus();
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
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se restauró la categoría 🎮 Videojuegos.");
    expect(toast).toHaveAttribute("data-tone", "success");
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

    expect(Object.fromEntries(actions.createCategoryAction.mock.calls[0][1] as FormData)).toEqual({ type: "expense", name: "Mascotas", nameEn: "", emoji: "🐾" });
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se creó la categoría 🐾 Mascotas.");
    expect(toast).toHaveAttribute("data-tone", "success");
    expect(screen.queryByRole("dialog")).toBeNull();
    // La ventana ya no está: el foco va al aviso emergente, no al principio de la página.
    expect(toast).toHaveFocus();
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

    expect(Object.fromEntries(actions.updateCategoryAction.mock.calls[0][1] as FormData)).toEqual({ id: "c1", name: "Salud", nameEn: "", emoji: "🛒" });
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
    expect(within(dialog()).getByText("A “Otros” solo se le pueden cambiar el emoji y el nombre en inglés.")).toBeInTheDocument();
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
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se archivó la categoría 🛒 Mercado.");
    expect(toast).toHaveAttribute("data-tone", "removal");
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

  it("eliminar avisa en rojo, y el aviso no está dentro de la lista (es un aviso emergente)", async () => {
    actions.deleteCategoryAction.mockResolvedValue({ message: "Se eliminó la categoría 🛒 Mercado." });
    renderManager();
    await openFromMenu("Mercado", "Eliminar");
    await userEvent.type(within(dialog()).getByLabelText("Código de Google Authenticator"), "123456");
    await userEvent.click(within(dialog()).getByRole("button", { name: /^Eliminar/ }));
    const toast = await findToast();
    expect(toast).toHaveTextContent("Se eliminó la categoría 🛒 Mercado.");
    expect(toast).toHaveAttribute("data-tone", "removal");
    expect(screen.getByRole("list", { name: "Categorías de egresos" })).not.toContainElement(toast);
    expect(toasts()).toHaveLength(1);
  });
});

describe("CategoryManager · errores de los campos en español", () => {
  it("crear sin nombre lo dice debajo del campo y no envía", async () => {
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear" }));
    expect(within(dialog()).getByLabelText("Nombre")).toHaveAccessibleDescription("Escribe un nombre.");
    expect(actions.createCategoryAction).not.toHaveBeenCalled();
  });

  it("archivar sin código lo dice y no envía", async () => {
    renderManager();
    await userEvent.click(within(row("Mercado")).getByRole("button", { name: "Más acciones para Mercado" }));
    await userEvent.click(within(row("Mercado")).getByRole("button", { name: /^Archivar/ }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Archivar" }));
    expect(within(dialog()).getByLabelText("Código de Google Authenticator")).toHaveAccessibleDescription(
      "Escribe el código de 6 dígitos de Google Authenticator.",
    );
    expect(actions.archiveCategoryAction).not.toHaveBeenCalled();
  });
});

describe("en inglés", () => {
  const renderEnglish = (type: "expense" | "income" = "expense") =>
    render(<CategoryManager type={type} categories={CATEGORIES} />, { english: true });

  it("la lista, Otros y las archivadas", () => {
    renderEnglish();
    expect(screen.getByText("They apply right away in the forms and in the bot.")).toBeInTheDocument();
    const active = within(screen.getByRole("list", { name: "Expense categories" }));
    expect(active.getAllByRole("listitem")[0]).toHaveTextContent("Mercado124 transactions");
    expect(row("Café")).toHaveTextContent("No transactions");
    expect(row("Otros")).toHaveTextContent("OtrosDefault57 transactions · its name can't change");
    expect(screen.getByRole("button", { name: "Edit Mercado" })).toHaveTextContent("Edit");
    expect(screen.getByRole("heading", { name: "Archived" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Archived expense categories" })).getByRole("button", { name: "Restore Videojuegos" })).toBeInTheDocument();
  });

  it("'⋯': archivar y eliminar, con lo que pasa con los movimientos", async () => {
    renderEnglish();
    await userEvent.click(screen.getByRole("button", { name: "More actions for Mercado" }));
    expect(screen.getAllByText("Asks for the code")).not.toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /^Archive/ }));
    expect(dialog()).toHaveAccessibleName("Archive the category Mercado?");
    expect(dialog()).toHaveAccessibleDescription(expect.stringContaining("The 124 transactions that already have it keep it."));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "More actions for Mercado" }));
    await userEvent.click(screen.getByRole("button", { name: /^Delete/ }));
    expect(dialog()).toHaveAccessibleName("Delete the category Mercado?");
    expect(dialog()).toHaveAccessibleDescription(expect.stringContaining("It has 124 transactions. If you delete it, they'll move to 📦 Otros."));
    expect(within(dialog()).getByRole("button", { name: "Delete and move to Otros" })).toBeInTheDocument();
  });

  it("nueva categoría: el formulario y el error del nombre", async () => {
    renderEnglish("income");
    await userEvent.click(screen.getByRole("button", { name: "New category" }));
    expect(dialog()).toHaveAccessibleName("New income category");
    expect(dialog()).toHaveAccessibleDescription("Income · it applies right away in the forms and in the bot.");
    const box = within(dialog());
    expect(box.getByRole("group", { name: "Suggested emojis" })).toBeInTheDocument();
    await userEvent.click(box.getByRole("button", { name: "Create" }));
    expect(box.getByLabelText("Name")).toHaveAccessibleDescription("Enter a name.");
    expect(actions.createCategoryAction).not.toHaveBeenCalled();
  });

  it("editar Otros: solo el emoji", async () => {
    renderEnglish();
    await userEvent.click(screen.getByRole("button", { name: "Edit Otros" }));
    expect(dialog()).toHaveAccessibleName("Edit the category Otros");
    expect(within(dialog()).getByText("Only the emoji and the English name of “Otros” can be changed.")).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("el nombre en inglés", () => {
  it("la fila lo muestra; el formulario lo pide (opcional, en inglés) y lo envía", async () => {
    actions.createCategoryAction.mockResolvedValue({ message: "Se creó la categoría 🐾 Mascotas." });
    renderManager([cat({ id: "c1", nameEn: "Groceries" }), ...CATEGORIES.slice(1)]);
    expect(row("Mercado")).toHaveTextContent("124 movimientos · en inglés: Groceries");
    await userEvent.click(screen.getByRole("button", { name: "Nueva categoría" }));
    const english = within(dialog()).getByRole("textbox", { name: "Nombre en inglés (opcional)" });
    expect(english).toHaveAttribute("lang", "en");
    expect(english).toHaveAttribute("maxlength", "40");
    expect(english).not.toBeRequired();
    expect(english).toHaveAccessibleDescription(
      "Así se ve con la app en inglés. Si lo dejas vacío, en inglés se ve el nombre de arriba. El bot usa siempre el de arriba.",
    );
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "Mascotas");
    await userEvent.type(english, "Pets");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear" }));
    expect(Object.fromEntries(actions.createCategoryAction.mock.calls[0][1] as FormData)).toMatchObject({ name: "Mascotas", nameEn: "Pets" });
  });

  it("al editar trae el de ahora; el error del servidor va junto a su campo", async () => {
    actions.updateCategoryAction.mockResolvedValue({ error: "Ya hay una categoría de egresos con ese nombre en inglés.", field: "nameEn" });
    renderManager([cat({ id: "c1", nameEn: "Groceries" })]);
    await userEvent.click(screen.getByRole("button", { name: "Editar Mercado" }));
    const english = within(dialog()).getByRole("textbox", { name: "Nombre en inglés (opcional)" });
    expect(english).toHaveValue("Groceries");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Guardar" }));
    expect(await within(dialog()).findByText("Ya hay una categoría de egresos con ese nombre en inglés.")).toBeInTheDocument();
    expect(english).toHaveAttribute("aria-invalid", "true");
    expect(english).toHaveAccessibleDescription(expect.stringContaining("Ya hay una categoría de egresos con ese nombre en inglés."));
    expect(within(dialog()).getByLabelText("Nombre")).not.toHaveAttribute("aria-invalid");
  });

  it("en Otros, el nombre no se edita pero el de inglés sí", async () => {
    renderManager();
    await userEvent.click(screen.getByRole("button", { name: "Editar Otros" }));
    expect(within(dialog()).getByLabelText("Nombre")).toHaveAttribute("readonly");
    expect(within(dialog()).getByRole("textbox", { name: "Nombre en inglés (opcional)" })).not.toHaveAttribute("readonly");
  });

  it("en inglés", async () => {
    render(<CategoryManager type="expense" categories={[cat({ id: "c1", nameEn: "Groceries" })]} />, { english: true });
    expect(row("Mercado")).toHaveTextContent("124 transactions · English: Groceries");
    await userEvent.click(screen.getByRole("button", { name: "Edit Mercado" }));
    expect(within(dialog()).getByRole("textbox", { name: "English name (optional)" })).toHaveAccessibleDescription(
      "This is what you see with the app in English. If you leave it empty, English shows the name above. The bot always uses the name above.",
    );
  });
});
