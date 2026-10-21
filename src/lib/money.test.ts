import { describe, expect, it } from "vitest";
import {
  amountInputValue,
  completeAmountDecimals,
  formatAmountTyping,
  formatMoney,
  formatPercent,
  formatShare,
  parseAmountInput,
  roundToCents,
  sumAmounts,
} from "./money";

describe("parseAmountInput", () => {
  it.each([
    ["$500.000", 500000],
    ["500.000", 500000],
    ["1.250.000", 1250000],
    ["500000", 500000],
    [" $ 12.500 ", 12500],
    // La coma separa los centavos.
    ["45.900,50", 45900.5],
    ["45.900,5", 45900.5],
    ["45.900,05", 45900.05],
    ["45900,99", 45900.99],
    ["1.250.000,01", 1250000.01],
    ["0,01", 0.01],
    [",5", 0.5],
    // Una coma sin centavos (se borraron) no cambia el monto.
    ["45.900,", 45900],
    ["45.900,00", 45900],
    // Sin coma, un punto final con 1 o 2 dígitos son centavos (teclado en inglés).
    ["45900.5", 45900.5],
    ["45900.50", 45900.5],
    ["1.250.000.5", 1250000.5],
    ["1.5", 1.5],
    // Un punto seguido de 3 dígitos siempre es de miles.
    ["1.500", 1500],
    ["  $ 45.900,50 COP ", 45900.5],
    ["9.999.999,99", 9999999.99],
  ])("%s → %d", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each([
    "",
    "abc",
    "0",
    "$0",
    "0,00",
    ",",
    ".",
    "-",
    "-5.000",
    "$-500.000",
    "5.000-",
    // El signo menos tipográfico (U+2212) que muestra la app: copiado de una lista o del balance.
    "−5.000",
    "−$5.000,00",
    // Cualquier otra raya o guion también es un negativo: la raya y el guion largo (el iPhone cambia
    // "--" por "—"), el de ancho completo de los teclados chino y japonés, y los guiones Unicode.
    "–5.000",
    "—5.000",
    "－5.000",
    "‐5.000",
    "‑5.000",
    "‒5.000",
    "﹣5.000",
    "$–5.000,00",
    // Más de dos decimales: "1,500" puede ser mil quinientos (en inglés) o 1,5: mejor no adivinar.
    "1,500",
    "45.900,505",
    // Una sola coma, y solo puntos antes de ella.
    "1,2,3",
    "1,50.000",
    // Más centavos de los que se pueden contar sin perder precisión.
    "90.071.992.547.409,92",
  ])("rechaza %j", (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });

  it("el monto más alto que se puede contar en centavos sin perder precisión", () => {
    expect(parseAmountInput("90.071.992.547.409,91")).toBe(90071992547409.91);
  });
});

describe("roundToCents", () => {
  it.each([
    [45900, 45900],
    [45900.5, 45900.5],
    [45900.555, 45900.56],
    [45900.554, 45900.55],
    [0.1 + 0.2, 0.3],
    [0.004, 0],
    [-45900.554, -45900.55],
  ])("%d → %d", (amount, expected) => {
    expect(roundToCents(amount)).toBe(expected);
  });

  it("nunca devuelve -0 (se mostraría \"-$0,00\")", () => {
    expect(Object.is(roundToCents(-0.001), 0)).toBe(true);
    expect(formatMoney(roundToCents(0.3 - 0.30000000000000004))).toBe("$0,00");
  });
});

describe("sumAmounts", () => {
  it("suma exacta en centavos", () => {
    expect(sumAmounts([])).toBe(0);
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts([45900.5, 25900.25, 1000])).toBe(72800.75);
    expect(sumAmounts([0.07, 0.07, 0.07])).toBe(0.21);
  });
});

describe("formatAmountTyping", () => {
  it.each([
    ["", ""],
    ["5", "5"],
    ["500", "500"],
    ["5000", "5.000"],
    ["500000", "500.000"],
    ["1250000", "1.250.000"],
    // Los puntos que ya tenía se recalculan: borrar el último dígito de "4.590" da "459".
    ["4.59", "459"],
    ["45.9000", "459.000"],
    ["$ 12a3", "123"],
    ["0005", "5"],
    ["0", "0"],
    // La coma abre los centavos, con máximo dos.
    ["45900,", "45.900,"],
    ["45.900,5", "45.900,5"],
    ["45.900,50", "45.900,50"],
    ["45.900,505", "45.900,50"],
    ["45.900,5,0", "45.900,50"],
    [",", "0,"],
    [",5", "0,5"],
    ["0,5", "0,5"],
    // Un punto al final también (el teclado en inglés no tiene coma).
    ["45.900.", "45.900,"],
    [".", "0,"],
    ["45.900,5.", "45.900,5"],
    // Lo que no es un dígito ni un separador se ignora también después del punto final.
    ["$45.900. ", "45.900,"],
    // Números largos sin perder dígitos.
    ["12345678901234567890", "12.345.678.901.234.567.890"],
  ])("%j → %j", (typed, expected) => {
    expect(formatAmountTyping(typed)).toBe(expected);
  });

  it("lo que muestra se vuelve a leer igual", () => {
    for (const typed of ["1250000", "45.900,5", "45.900.", "0,01"]) {
      const shown = formatAmountTyping(typed);
      expect(formatAmountTyping(shown)).toBe(shown);
    }
    expect(parseAmountInput(formatAmountTyping("1250000,5"))).toBe(1250000.5);
  });
});

describe("amountInputValue", () => {
  it.each([
    [45900, "45.900,00"],
    [500, "500,00"],
    [1250000, "1.250.000,00"],
    [45900.5, "45.900,50"],
    [45900.05, "45.900,05"],
    [0.01, "0,01"],
    [0.1 + 0.2, "0,30"],
    [100000000000, "100.000.000.000,00"],
  ])("%d → %j (siempre con sus dos decimales)", (amount, expected) => {
    expect(amountInputValue(amount)).toBe(expected);
  });

  it("al guardarlo de nuevo sin tocarlo, el monto no cambia", () => {
    for (const amount of [45900, 45900.5, 0.01, 1250000.99]) {
      expect(parseAmountInput(amountInputValue(amount))).toBe(amount);
    }
  });
});

describe("completeAmountDecimals", () => {
  it.each([
    ["500.000", "500.000,00"],
    ["500000", "500.000,00"],
    ["45.900,5", "45.900,50"],
    ["45.900,", "45.900,00"],
    ["45.900,05", "45.900,05"],
    ["0,5", "0,50"],
    ["$ 1250000,5", "1.250.000,50"],
  ])("al salir del campo: %j → %j", (typed, expected) => {
    expect(completeAmountDecimals(typed)).toBe(expected);
  });

  it("vacío (o sin dígitos) sigue vacío: el campo avisa que falta", () => {
    expect(completeAmountDecimals("")).toBe("");
    expect(completeAmountDecimals("abc")).toBe("");
  });

  it("lo completado se lee igual que lo escrito", () => {
    for (const typed of ["500.000", "45.900,5", "0,01"]) {
      expect(parseAmountInput(completeAmountDecimals(typed))).toBe(parseAmountInput(typed));
    }
  });
});

describe("formatMoney", () => {
  it.each([
    [500000, "$500.000,00"],
    [1000000, "$1.000.000,00"],
    [0, "$0,00"],
    [6500, "$6.500,00"],
    [999, "$999,00"],
    // El signo menos tipográfico (U+2212), el mismo que las listas ponen a los egresos.
    [-50000, "−$50.000,00"],
    [-25900.5, "−$25.900,50"],
    [1234.5, "$1.234,50"],
    [1234.567, "$1.234,57"],
    [45900.05, "$45.900,05"],
    [0.01, "$0,01"],
  ])("%d → %s", (amount, expected) => {
    expect(formatMoney(amount)).toBe(expected);
  });

  it("sin ningún espacio (ni el espacio duro que pone Intl)", () => {
    expect(formatMoney(1000000)).not.toMatch(/\s/);
  });

  it("otras monedas, igual: dos decimales y sin espacio", () => {
    expect(formatMoney(1234.5, "USD")).toBe("US$1.234,50");
  });
});

describe("formatShare", () => {
  it.each([
    [55, 100, "55"],
    [1, 3, "33"],
    [99.6, 100, "100"],
    [100, 100, "100"],
    // Con dinero pero menos del 1 %: no "0".
    [0.4, 100, "<1"],
    [7_200_000, 100_012_309_982.99, "<1"],
    [0.5, 100, "1"],
    // Sin dinero, o sin total.
    [0, 100, "0"],
    [10, 0, "0"],
    [-5, 100, "0"],
  ])("%d de %d → %s", (part, total, expected) => {
    expect(formatShare(part, total)).toBe(expected);
  });
});

describe("formatPercent", () => {
  it("en español, con un espacio duro antes del signo (RAE): no se separa del número al partir la línea", () => {
    expect(formatPercent(45)).toBe("45\u00a0%");
    expect(formatPercent("<1", "es")).toBe("<1\u00a0%");
    expect(formatPercent("1.500", "es")).toBe("1.500\u00a0%");
  });

  it("en inglés, pegado", () => {
    expect(formatPercent(45, "en")).toBe("45%");
    expect(formatPercent("<1", "en")).toBe("<1%");
  });
});

describe("en inglés (los separadores al revés)", () => {
  it("formatMoney: $1,000,000.00, con el mismo signo menos y el peso como $", () => {
    expect(formatMoney(1_000_000, "COP", "en")).toBe("$1,000,000.00");
    expect(formatMoney(45_900.5, "COP", "en")).toBe("$45,900.50");
    expect(formatMoney(-50_000, "COP", "en")).toBe("−$50,000.00");
    expect(formatMoney(0, "COP", "en")).toBe("$0.00");
    // El español no cambia, aunque antes se haya pedido el inglés (cada idioma, su formateador).
    expect(formatMoney(1_000_000, "COP", "es")).toBe("$1.000.000,00");
    expect(formatMoney(1_000_000)).toBe("$1.000.000,00");
  });

  it("parseAmountInput: la coma separa miles y el punto los centavos", () => {
    expect(parseAmountInput("$500,000", "en")).toBe(500_000);
    expect(parseAmountInput("1,250,000.50", "en")).toBe(1_250_000.5);
    expect(parseAmountInput("45900.5", "en")).toBe(45_900.5);
    expect(parseAmountInput("500000", "en")).toBe(500_000);
    // Sin punto, una coma final con 1 o 2 dígitos también son centavos (del teclado en español).
    expect(parseAmountInput("45900,5", "en")).toBe(45_900.5);
    expect(parseAmountInput("1.500,25", "en")).toBeNull();
    expect(parseAmountInput("-5,000", "en")).toBeNull();
    // En español, lo de siempre.
    expect(parseAmountInput("1.250.000,50", "es")).toBe(1_250_000.5);
  });

  it("formatAmountTyping: pone las comas de miles y deja dos centavos después del punto", () => {
    expect(formatAmountTyping("1250000.5", "en")).toBe("1,250,000.5");
    expect(formatAmountTyping("1250000", "en")).toBe("1,250,000");
    expect(formatAmountTyping("4,590", "en")).toBe("4,590");
    expect(formatAmountTyping("12.", "en")).toBe("12.");
    expect(formatAmountTyping("1250000,5", "es")).toBe("1.250.000,5");
  });

  it("amountInputValue y completeAmountDecimals: siempre con sus centavos", () => {
    expect(amountInputValue(45_900.5, "en")).toBe("45,900.50");
    expect(amountInputValue(45_900, "en")).toBe("45,900.00");
    expect(completeAmountDecimals("500,000", "en")).toBe("500,000.00");
    expect(completeAmountDecimals("45,900.5", "en")).toBe("45,900.50");
    expect(completeAmountDecimals("", "en")).toBe("");
    expect(completeAmountDecimals("500.000", "es")).toBe("500.000,00");
  });
});
