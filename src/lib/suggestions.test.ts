import { describe, expect, it } from "vitest";
import { MAX_SHOWN_SUGGESTIONS, matchSuggestions, searchKey, wordStartMatch } from "./suggestions";

const items = (...descriptions: string[]) => descriptions.map((description) => ({ description }));
const found = (typed: string, list: { description: string }[]) => matchSuggestions(typed, list).map((m) => m.item.description);

describe("searchKey", () => {
  it("sin tildes, en minúscula y sin espacios de más", () => {
    expect(searchKey("  Café   con LECHE ")).toBe("cafe con leche");
    expect(searchKey("Ñandú")).toBe("nandu");
    expect(searchKey("café")).toBe("cafe");
  });
});

describe("wordStartMatch", () => {
  it("dónde está, en posiciones del texto original", () => {
    expect(wordStartMatch("Varios arriendos", "ar")).toEqual({ start: 7, end: 9 });
    expect(wordStartMatch("Café Áki", "aki")).toEqual({ start: 5, end: 8 });
  });

  it("a mitad de palabra, o sin nada buscado, no hay coincidencia (no se marca nada)", () => {
    expect(wordStartMatch("hipotecario", "ari")).toBeNull();
    expect(wordStartMatch("Claro", "")).toBeNull();
  });
});

describe("matchSuggestions", () => {
  it("sin nada escrito no sugiere nada", () => {
    expect(matchSuggestions("", items("Mercado"))).toEqual([]);
    expect(matchSuggestions("   ", items("Mercado"))).toEqual([]);
  });

  it("encuentra sin importar mayúsculas ni tildes, y marca dónde coincide", () => {
    expect(matchSuggestions("CAFE", items("Un café", "Mercado"))).toEqual([{ item: { description: "Un café" }, start: 3, end: 7 }]);
    expect(matchSuggestions("café", items("Cafetería"))).toEqual([{ item: { description: "Cafetería" }, start: 0, end: 4 }]);
  });

  it("primero las que empiezan igual, después las que tienen una palabra que empieza igual", () => {
    const list = items("El mercado", "Mercado del barrio", "Mercadolibre", "Taxi");
    expect(found("merc", list)).toEqual(["Mercado del barrio", "Mercadolibre", "El mercado"]);
  });

  it("a mitad de palabra no cuenta (\"ari\" no trae hipotecario ni varios)", () => {
    const list = items("Crédito hipotecario Villa Verde", "Gastos varios", "Supermercado", "Arriendo Civita");
    expect(found("ari", list)).toEqual([]);
    expect(found("merc", list)).toEqual([]);
    expect(found("arri", list)).toEqual(["Arriendo Civita"]);
    expect(found("civ", list)).toEqual(["Arriendo Civita"]);
  });

  it("si aparece varias veces, cuenta la que está al comienzo de una palabra", () => {
    expect(matchSuggestions("ar", items("Varios arriendos"))).toEqual([{ item: { description: "Varios arriendos" }, start: 7, end: 9 }]);
  });

  it("después de un guion, una barra o un paréntesis también empieza una palabra", () => {
    const list = items("Crédito Bancolombia - María", "Cuota (Bogotá)", "Luz/agua");
    expect(found("mar", list)).toEqual(["Crédito Bancolombia - María"]);
    expect(found("bog", list)).toEqual(["Cuota (Bogotá)"]);
    expect(found("agu", list)).toEqual(["Luz/agua"]);
  });

  it("en cada grupo conserva el orden en que llegaron (las más usadas primero)", () => {
    expect(found("ta", items("Taxi", "Tarjeta", "Pasta", "Tapas", "Pago de tarjeta"))).toEqual([
      "Taxi",
      "Tarjeta",
      "Tapas",
      "Pago de tarjeta",
    ]);
  });

  it("no sugiere la que ya está escrita igual", () => {
    expect(found("mercado ", items("Mercado", "Mercado del barrio"))).toEqual(["Mercado del barrio"]);
  });

  it(`muestra hasta ${MAX_SHOWN_SUGGESTIONS} (o las que se pidan)`, () => {
    const many = items(...Array.from({ length: 10 }, (_, i) => `Gasto ${i}`));
    expect(matchSuggestions("gasto", many)).toHaveLength(MAX_SHOWN_SUGGESTIONS);
    expect(MAX_SHOWN_SUGGESTIONS).toBe(6);
    expect(matchSuggestions("gasto", many, 2)).toHaveLength(2);
  });

  it("con una tilde escrita como letra + acento, marca la letra con su acento", () => {
    const [match] = matchSuggestions("cafe", items("Un café doble"));
    expect(match).toMatchObject({ start: 3, end: 8 });
    expect("Un café doble".slice(match.start, match.end)).toBe("café");
  });

  it("las letras que no se parecen a nada no rompen la búsqueda (emojis)", () => {
    expect(matchSuggestions("cine", items("🎬 Cine"))).toEqual([{ item: { description: "🎬 Cine" }, start: 3, end: 7 }]);
  });
});
