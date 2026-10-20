"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/session";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  restoreCategory,
  updateCategory,
  type CategoryResult,
} from "@/modules/admin/categories/categories";

// Las acciones de /admin/categorias. Cada una valida el rol antes que nada; lo demás (validar,
// "Otros", el código para archivar y eliminar, el registro de cambios) está en
// src/modules/admin/categories/categories.ts.

export type CategoryActionState = { error?: string; field?: "name" | "emoji" | "code"; message?: string };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Con éxito, vuelve a dibujar la página (y los formularios y el bot ya usan lo nuevo) y avisa qué pasó. */
function settle(result: CategoryResult): CategoryActionState {
  if (!result.ok) return { error: result.error, field: result.field };
  refresh();
  return { message: result.message };
}

export async function createCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  await requireAdmin();
  return settle(await createCategory({ type: text(formData, "type"), name: text(formData, "name"), emoji: text(formData, "emoji") }));
}

export async function updateCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  await requireAdmin();
  return settle(await updateCategory({ id: text(formData, "id"), name: text(formData, "name"), emoji: text(formData, "emoji") }));
}

export async function archiveCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  await requireAdmin();
  return settle(await archiveCategory({ id: text(formData, "id"), code: text(formData, "code") }));
}

export async function restoreCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  await requireAdmin();
  return settle(await restoreCategory({ id: text(formData, "id") }));
}

export async function deleteCategoryAction(_prev: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  await requireAdmin();
  return settle(await deleteCategory({ id: text(formData, "id"), code: text(formData, "code") }));
}
