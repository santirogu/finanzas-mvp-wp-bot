import { describe, expect, it } from "vitest";
import {
  CATEGORIES_PATH,
  CATEGORY_NAME_MAX,
  CATEGORY_TYPES,
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPE_PARAMS,
  CATEGORY_TYPE_TEXTS,
  DEFAULT_CATEGORY,
  DEFAULT_EMOJI,
  EMOJI_SUGGESTIONS,
  changeSentence,
  foldName,
  isDefaultCategory,
  parseCategoryName,
  parseEnglishName,
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

describe("en inglés", () => {
  const change = (overrides: Partial<CategoryChangeEntry>): CategoryChangeEntry => ({
    action: "created",
    type: "expense",
    name: "Café",
    emoji: "☕",
    details: {},
    admin: { name: "Ana Admin" },
    ...overrides,
  });

  it("los tipos y los errores de lo que escribe el admin", () => {
    expect(CATEGORY_TYPE_TEXTS.en).toEqual({ expense: "Expenses", income: "Income" });
    expect(CATEGORY_TYPE_LABELS).toBe(CATEGORY_TYPE_TEXTS.es);
    expect(parseCategoryName("  ", "en")).toEqual({ ok: false, error: "Enter a name." });
    expect(parseCategoryName("x".repeat(CATEGORY_NAME_MAX + 1), "en")).toEqual({ ok: false, error: `${CATEGORY_NAME_MAX} characters at most.` });
    expect(parseEmoji("ab", "en")).toEqual({ ok: false, error: "Enter a single emoji." });
    expect(parseEmoji("🎮", "en")).toEqual({ ok: true, value: "🎮" });
  });

  it.each([
    [{}, "Ana Admin created ☕ Café (expenses)", null],
    [{ action: "updated", details: { previousName: "Cafe" } }, "Ana Admin renamed Cafe to ☕ Café (expenses)", null],
    [{ action: "updated", details: { previousName: "Café", previousEmoji: "🍵" } }, "Ana Admin changed the emoji of Café (expenses): 🍵 → ☕", null],
    [{ action: "updated", details: {} }, `Ana Admin changed the emoji of Café (expenses): ${DEFAULT_EMOJI} → ☕`, null],
    [{ action: "archived", type: "income" }, "Ana Admin archived ☕ Café (income)", null],
    [{ action: "restored" }, "Ana Admin restored ☕ Café (expenses)", null],
    [{ action: "deleted", details: { moved: 1 } }, "Ana Admin deleted the category ☕ Café (expenses)", `1 transaction moved to ${DEFAULT_CATEGORY}`],
    [{ action: "deleted", details: { moved: 4 } }, "Ana Admin deleted the category ☕ Café (expenses)", `4 transactions moved to ${DEFAULT_CATEGORY}`],
    [{ action: "deleted", admin: null }, "An admin deleted the category ☕ Café (expenses)", null],
  ] as const)("el cambio %j", (overrides, text, detail) => {
    expect(changeSentence(change(overrides as Partial<CategoryChangeEntry>), "en")).toEqual({ text, detail });
  });
});

describe("el nombre en inglés", () => {
  const change = (overrides: Partial<CategoryChangeEntry>): CategoryChangeEntry => ({
    action: "updated",
    type: "expense",
    name: "Mercado",
    emoji: "🛒",
    details: { previousName: "Mercado", previousEmoji: "🛒" },
    admin: { name: "Ana Admin" },
    ...overrides,
  });

  it("es opcional: vacío es null; si no, las mismas reglas que el nombre", () => {
    expect(parseEnglishName("")).toEqual({ ok: true, value: null });
    expect(parseEnglishName("   ")).toEqual({ ok: true, value: null });
    expect(parseEnglishName("  Groceries \n")).toEqual({ ok: true, value: "Groceries" });
    expect(parseEnglishName("x".repeat(CATEGORY_NAME_MAX + 1))).toEqual({ ok: false, error: `Máximo ${CATEGORY_NAME_MAX} caracteres.` });
    expect(parseEnglishName("x".repeat(CATEGORY_NAME_MAX + 1), "en")).toEqual({ ok: false, error: `${CATEGORY_NAME_MAX} characters at most.` });
  });

  it("al crearla con nombre en inglés, el detalle lo dice", () => {
    const created = change({ action: "created", details: { nameEn: "Groceries" } });
    expect(changeSentence(created)).toEqual({ text: "Ana Admin creó 🛒 Mercado (egresos)", detail: "en inglés: Groceries" });
    expect(changeSentence(created, "en")).toEqual({ text: "Ana Admin created 🛒 Mercado (expenses)", detail: "in English: Groceries" });
    expect(changeSentence(change({ action: "created", details: {} })).detail).toBeNull();
  });

  it("si solo cambió el nombre en inglés, la frase lo dice, con el de antes y el de ahora", () => {
    const english = change({ details: { previousName: "Mercado", previousEmoji: "🛒", nameEn: "Groceries", previousNameEn: null } });
    expect(changeSentence(english)).toEqual({ text: "Ana Admin cambió el nombre en inglés de 🛒 Mercado (egresos)", detail: "en inglés: — → Groceries" });
    expect(changeSentence(english, "en")).toEqual({
      text: "Ana Admin changed the English name of 🛒 Mercado (expenses)",
      detail: "in English: — → Groceries",
    });
    const removed = change({ details: { previousName: "Mercado", previousEmoji: "🛒", nameEn: null, previousNameEn: "Groceries" } });
    expect(changeSentence(removed).detail).toBe("en inglés: Groceries → —");
  });

  it("con otro cambio a la vez, la frase es la de ese cambio y el inglés va en el detalle; sin él, nada cambia", () => {
    const renamed = change({ name: "Supermercado", details: { previousName: "Mercado", previousEmoji: "🛒", nameEn: "Supermarket", previousNameEn: "Groceries" } });
    expect(changeSentence(renamed)).toEqual({ text: "Ana Admin renombró Mercado a 🛒 Supermercado (egresos)", detail: "en inglés: Groceries → Supermarket" });
    const emoji = change({ emoji: "🧺", details: { previousName: "Mercado", previousEmoji: "🛒", nameEn: "Groceries", previousNameEn: null } });
    expect(changeSentence(emoji).text).toBe("Ana Admin cambió el emoji de Mercado (egresos): 🛒 → 🧺");
    expect(changeSentence(change({ emoji: "🧺" }))).toEqual({ text: "Ana Admin cambió el emoji de Mercado (egresos): 🛒 → 🧺", detail: null });
  });
});
