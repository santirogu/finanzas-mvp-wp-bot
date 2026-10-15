import { describe, expect, it } from "vitest";
import {
  CATEGORIES_PATH,
  CATEGORY_NAME_MAX,
  CATEGORY_TYPES,
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPE_PARAMS,
  DEFAULT_CATEGORY,
  DEFAULT_EMOJI,
  EMOJI_SUGGESTIONS,
  changeSentence,
  foldName,
  isDefaultCategory,
  parseCategoryName,
  parseCategoryType,
  parseEmoji,
  sortCategories,
  type CategoryChangeEntry,
} from "./category-input";

const NULL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

describe("configuración", () => {
  it("vive en /admin/categorias, con egresos e ingresos", () => {
    expect(CATEGORIES_PATH).toBe("/admin/categorias");
    expect(CATEGORY_TYPES).toEqual(["expense", "income"]);
    expect(CATEGORY_TYPE_LABELS).toEqual({ expense: "Egresos", income: "Ingresos" });
    expect(CATEGORY_TYPE_PARAMS).toEqual({ expense: "egresos", income: "ingresos" });
    expect(DEFAULT_CATEGORY).toBe("Otros");
    expect(DEFAULT_EMOJI).toBe("•");
    expect(CATEGORY_NAME_MAX).toBe(40);
  });

  it("las sugerencias son emojis válidos y sin repetir", () => {
    expect(EMOJI_SUGGESTIONS.expense).toHaveLength(12);
    expect(EMOJI_SUGGESTIONS.expense).toContain("🛒");
    expect(EMOJI_SUGGESTIONS.income).toHaveLength(8);
    expect(EMOJI_SUGGESTIONS.income).toContain("💼");
    for (const type of CATEGORY_TYPES) {
      expect(new Set(EMOJI_SUGGESTIONS[type]).size, type).toBe(EMOJI_SUGGESTIONS[type].length);
      for (const emoji of EMOJI_SUGGESTIONS[type]) expect(parseEmoji(emoji), emoji).toEqual({ ok: true, value: emoji });
    }
  });
});

describe("parseCategoryType", () => {
  it.each([
    ["ingresos", "income"],
    ["egresos", "expense"],
    [undefined, "expense"],
    ["income", "expense"],
    [["ingresos"], "expense"],
    ["INGRESOS", "expense"],
  ] as const)("%j → %s", (value, expected) => {
    expect(parseCategoryType(value as string | string[] | undefined)).toBe(expected);
  });
});

describe("foldName e isDefaultCategory", () => {
  it("compara sin mayúsculas, tildes ni espacios de más", () => {
    expect(foldName("  Mércado   Central ")).toBe("mercado central");
    expect(foldName("ÉDUCACIÓN")).toBe("educacion");
    expect(foldName("Pingüino")).toBe("pinguino");
    expect(foldName("Año")).toBe("ano");
  });

  it.each(["Otros", "otros", " OTROS ", "Ótros"])("%j es la categoría por defecto", (name) => {
    expect(isDefaultCategory(name)).toBe(true);
  });

  it.each(["Otro", "Otros gastos", "Mercado", ""])("%j no lo es", (name) => {
    expect(isDefaultCategory(name)).toBe(false);
  });
});

describe("sortCategories", () => {
  it("alfabético sin importar tildes ni mayúsculas, con Otros al final", () => {
    const sorted = sortCategories([
      { name: "Otros" },
      { name: "transporte" },
      { name: "Éxito" },
      { name: "Alimentación" },
      { name: "Educación" },
      { name: "ahorro" },
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["ahorro", "Alimentación", "Educación", "Éxito", "transporte", "Otros"]);
  });

  it("dos nombres que solo cambian en mayúsculas quedan en el orden en que llegaron", () => {
    expect(sortCategories([{ name: "Ropa" }, { name: "ropa" }]).map((c) => c.name)).toEqual(["Ropa", "ropa"]);
    expect(sortCategories([{ name: "ropa" }, { name: "Ropa" }]).map((c) => c.name)).toEqual(["ropa", "Ropa"]);
  });

  it("no cambia la lista original", () => {
    const original = [{ name: "B" }, { name: "A" }];
    sortCategories(original);
    expect(original.map((c) => c.name)).toEqual(["B", "A"]);
  });
});

describe("parseCategoryName", () => {
  it("deja el nombre en una línea, sin espacios de más ni caracteres de control", () => {
    expect(parseCategoryName("  Mercado \n central ")).toEqual({ ok: true, value: "Mercado central" });
    expect(parseCategoryName(`Ca${NULL}fé${TAB}`)).toEqual({ ok: true, value: "Café" });
    expect(parseCategoryName(`Ca${String.fromCharCode(127)}fé`)).toEqual({ ok: true, value: "Café" });
    expect(parseCategoryName("Niños 👶")).toEqual({ ok: true, value: "Niños 👶" });
  });

  it.each(["", "   ", NULL])("vacío (%j) no sirve", (raw) => {
    expect(parseCategoryName(raw)).toEqual({ ok: false, error: "Escribe un nombre." });
  });

  it("de máximo 40 caracteres", () => {
    expect(parseCategoryName("a".repeat(40))).toEqual({ ok: true, value: "a".repeat(40) });
    expect(parseCategoryName("a".repeat(41))).toEqual({ ok: false, error: "Máximo 40 caracteres." });
  });
});

describe("parseEmoji", () => {
  it.each(["🛒", "🍽️", "👨‍👩‍👧", "🇨🇴", "❤️", "👍🏽", "🐾"])("acepta %s", (emoji) => {
    expect(parseEmoji(emoji)).toEqual({ ok: true, value: emoji });
  });

  it("sin espacios alrededor", () => {
    expect(parseEmoji(" 🛒 ")).toEqual({ ok: true, value: "🛒" });
  });

  it.each(["", "   ", "•"])("vacío o • (%j) es •", (raw) => {
    expect(parseEmoji(raw)).toEqual({ ok: true, value: "•" });
  });

  it.each(["a", "ab", "🛒🛒", "🛒 a", "1", "%", "<b>"])("rechaza %j", (raw) => {
    expect(parseEmoji(raw)).toEqual({ ok: false, error: "Escribe un solo emoji." });
  });
});

describe("changeSentence", () => {
  const change = (overrides: Partial<CategoryChangeEntry>): CategoryChangeEntry => ({
    action: "created",
    type: "expense",
    name: "Café",
    emoji: "☕",
    details: {},
    admin: { name: "Ana Admin" },
    ...overrides,
  });

  it.each([
    [{ action: "created" }, "Ana Admin creó ☕ Café (egresos)", null],
    [{ action: "created", type: "income" }, "Ana Admin creó ☕ Café (ingresos)", null],
    [{ action: "archived" }, "Ana Admin archivó ☕ Café (egresos)", null],
    [{ action: "restored" }, "Ana Admin restauró ☕ Café (egresos)", null],
    [{ action: "updated", details: { previousName: "Tinto", previousEmoji: "☕" } }, "Ana Admin renombró Tinto a ☕ Café (egresos)", null],
    [{ action: "updated", details: { previousName: "Café", previousEmoji: "🍵" } }, "Ana Admin cambió el emoji de Café (egresos): 🍵 → ☕", null],
    [{ action: "updated", details: {} }, "Ana Admin cambió el emoji de Café (egresos): • → ☕", null],
    [{ action: "deleted" }, "Ana Admin eliminó la categoría ☕ Café (egresos)", null],
    [{ action: "deleted", details: { moved: 1 } }, "Ana Admin eliminó la categoría ☕ Café (egresos)", "1 movimiento pasó a Otros"],
    [{ action: "deleted", details: { moved: 12 } }, "Ana Admin eliminó la categoría ☕ Café (egresos)", "12 movimientos pasaron a Otros"],
  ] as const)("%j", (overrides, text, detail) => {
    expect(changeSentence(change(overrides as Partial<CategoryChangeEntry>))).toEqual({ text, detail });
  });

  it("si la cuenta del admin ya no existe, dice 'Un admin'", () => {
    expect(changeSentence(change({ admin: null })).text).toBe("Un admin creó ☕ Café (egresos)");
  });
});
