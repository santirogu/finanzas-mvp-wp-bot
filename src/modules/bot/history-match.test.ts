import { describe, expect, it } from "vitest";
import { matchHistory, meaningfulWords, type HistoryEntry } from "./history-match";

const entry = (description: string, uses = 1, categoryId: string | null = "cat"): HistoryEntry => ({ description, categoryId, uses });

describe("meaningfulWords", () => {
  it("sin tildes, mayúsculas, signos ni las palabras que no cuentan", () => {
    expect(meaningfulWords("  Pago de CLARÓ, amor! ")).toEqual(["pago", "claro", "amor"]);
    expect(meaningfulWords("Almuerzo con la familia")).toEqual(["almuerzo", "familia"]);
    expect(meaningfulWords("de la")).toEqual([]);
    expect(meaningfulWords("Plan 5G-Max")).toEqual(["plan", "5g", "max"]);
  });

  it.each(["a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "mi", "mis", "para", "por", "su", "sus", "un", "una", "y"])(
    "'%s' no cuenta",
    (word) => {
      expect(meaningfulWords(`pago ${word} claro`)).toEqual(["pago", "claro"]);
    },
  );
});

describe("matchHistory", () => {
  it("el caso del dueño: 'pago claro amor' es 'Claro Postpago Cata Amor'", () => {
    const history = [entry("Mercado", 9), entry("Claro Postpago Cata Amor", 3, "servicios")];
    expect(matchHistory("Pago claro amor", history)).toEqual(entry("Claro Postpago Cata Amor", 3, "servicios"));
  });

  it("todas las palabras tienen que estar: con una que falte, no", () => {
    expect(matchHistory("pago claro hogar", [entry("Claro Postpago Cata Amor")])).toBeNull();
  });

  it("una palabra está si es igual, si empieza otra (desde 3 letras) o si está dentro (desde 4)", () => {
    expect(matchHistory("net familiar", [entry("Netflix familiar")])?.description).toBe("Netflix familiar");
    expect(matchHistory("pago claro", [entry("Postpago Claro")])?.description).toBe("Postpago Claro");
    // Con menos letras, solo al comienzo: "ago" no está en "postpago".
    expect(matchHistory("ago claro", [entry("Postpago Claro")])).toBeNull();
    expect(matchHistory("ne claro", [entry("Netflix Claro")])).toBeNull();
    // Igual, aunque tenga menos de 3 letras: "tv" está en "Plan TV Cable".
    expect(matchHistory("tv cable", [entry("Plan TV Cable")])?.description).toBe("Plan TV Cable");
  });

  it("sin importar tildes, mayúsculas, el orden ni las palabras que no cuentan", () => {
    expect(matchHistory("CLARO de pago", [entry("Pago Claro")])?.description).toBe("Pago Claro");
    expect(matchHistory("cafe con leche", [entry("Café con leche")])?.description).toBe("Café con leche");
  });

  it("con una sola palabra, solo la que tiene esa misma: nunca una más larga", () => {
    expect(matchHistory("almuerzo", [entry("Almuerzo con Ana", 5)])).toBeNull();
    expect(matchHistory("almuerzo", [entry("Almuerzo con Ana", 5), entry("ALMUERZO", 1)])?.description).toBe("ALMUERZO");
    expect(matchHistory("la luz", [entry("Luz")])?.description).toBe("Luz");
  });

  it("entre varias, primero la que tiene exactamente sus palabras, aunque se use menos", () => {
    const history = [entry("Claro Postpago Cata Amor", 8), entry("Pago Claro Amor", 1)];
    expect(matchHistory("pago claro amor", history)?.description).toBe("Pago Claro Amor");
  });

  it("si no, la más usada; si empatan dos, ninguna (mejor la de Claude que adivinar)", () => {
    expect(matchHistory("pago claro", [entry("Claro Postpago Cata", 2), entry("Claro Postpago Hogar", 5)])?.description).toBe("Claro Postpago Hogar");
    expect(matchHistory("pago claro", [entry("Claro Postpago Cata", 3), entry("Claro Postpago Hogar", 3)])).toBeNull();
    expect(matchHistory("pago claro", [entry("Claro Postpago Cata", 3), entry("Claro Postpago Hogar", 3), entry("Claro Postpago Mamá", 4)])?.description).toBe("Claro Postpago Mamá");
  });

  it("las palabras vacías del inglés tampoco cuentan", () => {
    expect(meaningfulWords("Lunch with the team at the office")).toEqual(["lunch", "team", "office"]);
    expect(matchHistory("lunch with Ana", [entry("Lunch Ana")])?.description).toBe("Lunch Ana");
  });

  it("sin historial, sin palabras que cuenten o sin coincidencias, ninguna", () => {
    expect(matchHistory("pago claro", [])).toBeNull();
    expect(matchHistory("de la", [entry("De la casa")])).toBeNull();
    expect(matchHistory("Gasto", [entry("Mercado")])).toBeNull();
  });
});
