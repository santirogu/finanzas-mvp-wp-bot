import { describe, expect, it } from "vitest";
import { categoryLabel } from "./category-name";
import { sortCategories } from "./default-categories";

describe("categoryLabel (el nombre a la vista)", () => {
  it("en inglés, el que le puso el admin; sin él, o en español, el de siempre", () => {
    expect(categoryLabel({ name: "Mercado", nameEn: "Groceries" }, "en")).toBe("Groceries");
    expect(categoryLabel({ name: "Mercado", nameEn: null }, "en")).toBe("Mercado");
    expect(categoryLabel({ name: "Mercado", nameEn: "" }, "en")).toBe("Mercado");
    expect(categoryLabel({ name: "Mercado", nameEn: "Groceries" }, "es")).toBe("Mercado");
    expect(categoryLabel({ name: "Mercado", nameEn: "Groceries" })).toBe("Mercado");
  });
});

describe("sortCategories con el nombre a la vista", () => {
  const rows = [
    { name: "Otros", nameEn: "Other" },
    { name: "Mercado", nameEn: "Groceries" },
    { name: "Alimentación", nameEn: "Food" },
    { name: "Transporte", nameEn: null },
  ];

  it("alfabético por el nombre en inglés, y Otros al final aunque se vea como Other", () => {
    const label = (row: (typeof rows)[number]) => categoryLabel(row, "en");
    expect(sortCategories(rows, label).map(label)).toEqual(["Food", "Groceries", "Transporte", "Other"]);
  });

  it("sin `label`, por el nombre de siempre", () => {
    expect(sortCategories(rows).map((row) => row.name)).toEqual(["Alimentación", "Mercado", "Transporte", "Otros"]);
  });
});
