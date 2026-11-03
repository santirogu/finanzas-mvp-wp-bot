import { describe, expect, it } from "vitest";
import { isDefaultCategory, isSystemCategory, isTaxCategory, sortCategories, TAX_CATEGORY } from "./default-categories";
// Sin la base (las unitarias corren sin DATABASE_URL): el cálculo y la descripción están aparte de gmf.ts.
import { gmfAmount, gmfDescription, gmfExternalId } from "./gmf-amount";

describe("gmfAmount (el 4x1000: 4 por cada 1.000, a los centavos)", () => {
  it.each([
    [50_000, 200],
    [1_000, 4],
    [45_900.5, 183.6],
    [1_234_567.89, 4938.27],
    [99_999_999_999.99, 400_000_000],
    [2.5, 0.01],
    [1, 0],
  ])("%d → %d", (amount, expected) => {
    expect(gmfAmount(amount)).toBe(expected);
  });
});

describe("gmfDescription", () => {
  it("dice de qué egreso es", () => {
    expect(gmfDescription("Arriendo")).toBe("4x1000 · Arriendo");
  });

  it("cabe en las 140 letras de una descripción", () => {
    expect(gmfDescription("a".repeat(140))).toHaveLength(140);
    expect(gmfDescription("a".repeat(140))).toMatch(/^4x1000 · a+$/);
  });
});

describe("gmfExternalId (el del bot: el mismo mensaje, para que 'deshacer' se lleve los dos)", () => {
  it("cambia solo el índice del movimiento", () => {
    expect(gmfExternalId("wamid.ABC:0")).toBe("wamid.ABC:4x0");
    expect(gmfExternalId("wamid.A:B:12")).toBe("wamid.A:B:4x12");
  });

  it("un egreso de la web no tiene", () => {
    expect(gmfExternalId(null)).toBeNull();
  });
});

describe("la categoría del 4x1000", () => {
  it("es Impuestos, de egresos, sin importar mayúsculas, tildes ni espacios", () => {
    expect(TAX_CATEGORY).toBe("Impuestos");
    for (const name of ["Impuestos", " impuestos ", "IMPUESTOS", "Impuéstos"]) expect(isTaxCategory(name, "expense"), name).toBe(true);
    expect(isTaxCategory("Impuestos", "income")).toBe(false);
    expect(isTaxCategory("Impuesto", "expense")).toBe(false);
  });

  it("es del sistema, como Otros (que es de los dos tipos); las demás no", () => {
    expect(isSystemCategory("Impuestos", "expense")).toBe(true);
    expect(isSystemCategory("Otros", "income")).toBe(true);
    expect(isSystemCategory("Otros", "expense")).toBe(true);
    expect(isSystemCategory("Impuestos", "income")).toBe(false);
    expect(isSystemCategory("Mercado", "expense")).toBe(false);
    // "Otros" sigue siendo la única por defecto (la que va al final y usa el bot si ninguna encaja).
    expect(isDefaultCategory("Impuestos")).toBe(false);
    expect(sortCategories([{ name: "Otros" }, { name: "Impuestos" }, { name: "Mercado" }]).map((c) => c.name)).toEqual(["Impuestos", "Mercado", "Otros"]);
  });
});
