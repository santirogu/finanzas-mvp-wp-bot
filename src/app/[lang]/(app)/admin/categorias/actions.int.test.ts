import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { category, categoryChange } from "@/db/schema";
import { createAdminWithTwoFactor } from "../../../../../../test/integration/two-factor";

// Las Server Actions de /admin/categorias con la capa de datos y la base de verdad. Se simulan la
// sesión y refresh(): aquí se prueba que validan el rol antes que nada, que leen bien el formulario y
// que solo con éxito vuelven a dibujar la página.
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

const { archiveCategoryAction, createCategoryAction, deleteCategoryAction, restoreCategoryAction, updateCategoryAction } =
  await import("./actions");

async function adminReady() {
  const ready = await createAdminWithTwoFactor();
  mocks.requireAdmin.mockResolvedValue({ id: ready.admin.id, role: "admin", twoFactorEnabled: true });
  return { code: () => ready.codeAt(new Date()) };
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const byName = (name: string) =>
  db
    .select()
    .from(category)
    .where(and(eq(category.name, name), eq(category.type, "expense"), isNull(category.userId)))
    .then((rows) => rows[0]);

beforeEach(() => {
  mocks.requireAdmin.mockReset();
  mocks.refresh.mockReset();
});

describe("con éxito avisan y vuelven a dibujar la página", () => {
  it("crear, editar, archivar, restaurar y eliminar", async () => {
    const { code } = await adminReady();
    expect(await createCategoryAction({}, form({ type: "expense", name: "Café", emoji: "☕" }))).toEqual({ message: "Se creó la categoría ☕ Café." });
    const cafe = await byName("Café");
    expect(await updateCategoryAction({}, form({ id: cafe.id, name: "Tinto", emoji: "☕" }))).toEqual({ message: "Se guardó la categoría ☕ Tinto." });
    expect(await archiveCategoryAction({}, form({ id: cafe.id, code: code() }))).toEqual({ message: "Se archivó la categoría ☕ Tinto." });
    expect(await restoreCategoryAction({}, form({ id: cafe.id }))).toEqual({ message: "Se restauró la categoría ☕ Tinto." });
    // Otro código: el anterior ya se usó.
    const next = (await createAdminWithTwoFactor({ name: "Otro Admin" }));
    mocks.requireAdmin.mockResolvedValue({ id: next.admin.id, role: "admin", twoFactorEnabled: true });
    expect(await deleteCategoryAction({}, form({ id: cafe.id, code: next.codeAt(new Date()) }))).toEqual({ message: "Se eliminó la categoría ☕ Tinto." });
    expect(mocks.refresh).toHaveBeenCalledTimes(5);
    expect((await db.select({ action: categoryChange.action }).from(categoryChange)).map((c) => c.action).sort()).toEqual(
      ["archived", "created", "deleted", "restored", "updated"],
    );
  });
});

describe("con un error devuelven el campo y no redibujan", () => {
  it.each([
    ["crear sin nombre", () => createCategoryAction({}, form({ type: "expense", name: "", emoji: "" })), { error: "Escribe un nombre.", field: "name" }],
    ["crear con un emoji inválido", () => createCategoryAction({}, form({ type: "expense", name: "X", emoji: "ab" })), { error: "Escribe un solo emoji.", field: "emoji" }],
    ["editar una que no existe", () => updateCategoryAction({}, form({ id: "no-existe", name: "X", emoji: "" })), { error: "Esta categoría ya no existe." }],
    ["archivar sin código", () => archiveCategoryAction({}, form({ id: "no-existe" })), { error: "Esta categoría ya no existe." }],
    ["restaurar una que no existe", () => restoreCategoryAction({}, new FormData()), { error: "Esta categoría ya no existe." }],
    ["eliminar con el formulario vacío", () => deleteCategoryAction({}, new FormData()), { error: "Esta categoría ya no existe." }],
  ] as const)("%s", async (_, run, expected) => {
    await adminReady();
    expect(await run()).toEqual(expected);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("archivar con un código equivocado marca el campo del código", async () => {
    await adminReady();
    const ropa = await byName("Ropa");
    expect(await archiveCategoryAction({}, form({ id: ropa.id, code: "12345" }))).toEqual({
      error: "Escribe los 6 dígitos del código de Google Authenticator.",
      field: "code",
    });
  });
});

describe("sin admin", () => {
  it.each([
    ["createCategoryAction", () => createCategoryAction({}, form({ type: "expense", name: "Intrusa", emoji: "" }))],
    ["updateCategoryAction", async () => updateCategoryAction({}, form({ id: (await byName("Ropa")).id, name: "Intrusa", emoji: "" }))],
    ["archiveCategoryAction", async () => archiveCategoryAction({}, form({ id: (await byName("Ropa")).id, code: "123456" }))],
    ["restoreCategoryAction", async () => restoreCategoryAction({}, form({ id: (await byName("Ropa")).id }))],
    ["deleteCategoryAction", async () => deleteCategoryAction({}, form({ id: (await byName("Ropa")).id, code: "123456" }))],
  ] as const)("%s falla antes de tocar nada", async (_, run) => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
    expect(await byName("Ropa")).toMatchObject({ archivedAt: null });
    expect(await byName("Intrusa")).toBeUndefined();
    expect(await db.select().from(categoryChange)).toEqual([]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
