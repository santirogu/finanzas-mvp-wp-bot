import { describe, expect, it } from "vitest";
import { NO_CATEGORIES, NO_CATEGORY, SEARCH_FROM, searchTransactions } from "./search";

const t = (description: string, categoryName: string | null = "Servicios") => ({ description, categoryName });
const ITEMS = [
  t("Arriendo Civita", "Vivienda"),
  t("Claro Postpago Papo"),
  t("Claro Hogar Áki"),
  t("Crédito Hipotecario Áki Bancolombia", "Deudas"),
  t("Pago de la tarjeta", null),
];
const descriptions = (hits: ReturnType<typeof searchTransactions>) => hits?.map((h) => h.item.description);

describe("searchTransactions", () => {
  it("aparece desde 6 movimientos", () => {
    expect(SEARCH_FROM).toBe(6);
  });

  it("sin nada escrito (o solo espacios) no hay búsqueda", () => {
    expect(searchTransactions("", ITEMS)).toBeNull();
    expect(searchTransactions("   ", ITEMS)).toBeNull();
  });

  it("por el comienzo de una palabra de la descripción, en el orden de la lista", () => {
    const hits = searchTransactions("claro", ITEMS);
    expect(descriptions(hits)).toEqual(["Claro Postpago Papo", "Claro Hogar Áki"]);
    expect(hits?.[0]).toEqual({ item: ITEMS[1], description: { start: 0, end: 5 }, category: null });
  });

  it("también por otra palabra que no es la primera", () => {
    expect(searchTransactions("civ", ITEMS)?.[0]).toMatchObject({ description: { start: 9, end: 12 } });
  });

  it("a mitad de palabra no cuenta", () => {
    expect(searchTransactions("ari", ITEMS)).toEqual([]);
  });

  it("sin importar mayúsculas, tildes ni espacios de más (y marca el texto con su tilde)", () => {
    const hits = searchTransactions("  AKI  ", ITEMS);
    expect(descriptions(hits)).toEqual(["Claro Hogar Áki", "Crédito Hipotecario Áki Bancolombia"]);
    expect(hits?.[0].description).toEqual({ start: 12, end: 15 });
    expect(descriptions(searchTransactions("credito  hipo", ITEMS))).toEqual(["Crédito Hipotecario Áki Bancolombia"]);
  });

  it("por la categoría, con dónde coincide", () => {
    const hits = searchTransactions("deu", ITEMS);
    expect(hits).toEqual([{ item: ITEMS[3], description: null, category: { start: 0, end: 3 } }]);
  });

  it("en la descripción y en la categoría a la vez", () => {
    const both = [t("Servicios públicos")];
    expect(searchTransactions("serv", both)).toEqual([
      { item: both[0], description: { start: 0, end: 4 }, category: { start: 0, end: 4 } },
    ]);
  });

  it(`los que no tienen categoría se encuentran por "${NO_CATEGORY}", como dice su fila`, () => {
    expect(NO_CATEGORY).toBe("Sin categoría");
    const hits = searchTransactions("sin cat", ITEMS);
    expect(hits).toEqual([{ item: ITEMS[4], description: null, category: { start: 0, end: 7 } }]);
  });

  it("nada coincide: lista vacía (no null)", () => {
    expect(searchTransactions("zzz", ITEMS)).toEqual([]);
  });
});

describe("searchTransactions · en inglés", () => {
  it("los que no tienen categoría se encuentran por lo que dice la fila en inglés", () => {
    const items = [{ description: "Lunch", categoryName: null }, { description: "Rent", categoryName: "Vivienda" }];
    expect(searchTransactions("no cat", items, "en")?.map((h) => h.item.description)).toEqual(["Lunch"]);
    expect(searchTransactions("sin cat", items, "en")).toEqual([]);
    expect(NO_CATEGORIES).toEqual({ es: NO_CATEGORY, en: "No category" });
  });
});
