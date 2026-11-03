import { describe, expect, it } from "vitest";
import { balanceChange, previousMonthReference, totalChange } from "./month-comparison";

const agosto = previousMonthReference("agosto", false);
const august = previousMonthReference("August", false, "en");

describe("balanceChange", () => {
  it("dice cuánto más o menos que el mes anterior, en plata", () => {
    expect(balanceChange(850000, 730000, agosto)).toEqual({ direction: "up", text: "$120.000,00 más que agosto" });
    expect(balanceChange(-50000, 25000.5, agosto)).toEqual({ direction: "down", text: "$75.000,50 menos que agosto" });
  });

  it("igual si no cambió (sin restos de float)", () => {
    expect(balanceChange(0.3, 0.1 + 0.2, agosto)).toEqual({ direction: "same", text: "Igual que agosto" });
  });

  it("usa la moneda del usuario", () => {
    expect(balanceChange(100, 0, agosto, "USD").text).toMatch(/^US\$100,00 más que agosto$/);
  });
});

describe("totalChange", () => {
  it("dice cuánto más o menos que el mes anterior, en porcentaje redondeado", () => {
    expect(totalChange(3350000, 2913043, agosto, "expense")).toEqual({
      direction: "up",
      text: "15\u00a0% más que agosto",
    });
    expect(totalChange(920000, 1000000, agosto, "income")).toEqual({
      direction: "down",
      text: "8\u00a0% menos que agosto",
    });
    expect(totalChange(0, 1000, agosto, "expense")).toEqual({ direction: "down", text: "100\u00a0% menos que agosto" });
  });

  it("con miles, el punto de los miles", () => {
    expect(totalChange(250000, 2000, agosto, "expense").text).toBe("12.400\u00a0% más que agosto");
  });

  it("igual si no cambió, y 'casi igual' si cambió menos del medio por ciento", () => {
    expect(totalChange(4200000, 4200000, agosto, "income")).toEqual({ direction: "same", text: "Igual que agosto" });
    expect(totalChange(0, 0, agosto, "income")).toEqual({ direction: "same", text: "Igual que agosto" });
    expect(totalChange(1004, 1000, agosto, "expense")).toEqual({ direction: "up", text: "Casi igual que agosto" });
    expect(totalChange(996, 1000, agosto, "expense")).toEqual({ direction: "down", text: "Casi igual que agosto" });
    expect(totalChange(1005, 1000, agosto, "expense").text).toBe("1\u00a0% más que agosto");
  });

  it("si el mes anterior no tuvo, no hay porcentaje: lo dice", () => {
    expect(totalChange(500000, 0, agosto, "income")).toEqual({ direction: "up", text: "Sin ingresos en agosto" });
    expect(totalChange(500000, 0, agosto, "expense").text).toBe("Sin egresos en agosto");
  });

  it("los centavos que no cambian nada no cuentan como cambio", () => {
    expect(totalChange(0.1 + 0.2, 0.3, agosto, "expense").direction).toBe("same");
  });
});

describe("en inglés", () => {
  it("el balance y los totales frente al mes anterior", () => {
    expect(balanceChange(850000, 730000, august, "COP", "en")).toEqual({ direction: "up", text: "$120,000.00 more than August" });
    expect(balanceChange(-50000, 25000.5, august, "COP", "en")).toEqual({ direction: "down", text: "$75,000.50 less than August" });
    expect(balanceChange(1, 1, august, "COP", "en")).toEqual({ direction: "same", text: "Same as August" });
    expect(totalChange(250000, 2000, august, "expense", "en").text).toBe("12,400% more than August");
    expect(totalChange(920000, 1000000, august, "income", "en")).toEqual({ direction: "down", text: "8% less than August" });
    expect(totalChange(1004, 1000, august, "expense", "en").text).toBe("Almost the same as August");
    expect(totalChange(500000, 0, august, "income", "en").text).toBe("No income in August");
    expect(totalChange(500000, 0, august, "expense", "en").text).toBe("No expenses in August");
    expect(totalChange(5, 5, august, "expense", "en").text).toBe("Same as August");
  });
});

describe("con el mes en curso, contra el anterior hasta el mismo día", () => {
  it("dice 'a esta altura de' en todas las frases", () => {
    const ref = previousMonthReference("septiembre", true);
    expect(balanceChange(1220000, 1125000, ref)).toEqual({ direction: "up", text: "$95.000,00 más que a esta altura de septiembre" });
    expect(totalChange(2980000, 2811321, ref, "expense").text).toBe("6\u00a0% más que a esta altura de septiembre");
    expect(totalChange(1, 1, ref, "income").text).toBe("Igual que a esta altura de septiembre");
    expect(totalChange(1004, 1000, ref, "expense").text).toBe("Casi igual que a esta altura de septiembre");
    expect(totalChange(500000, 0, ref, "expense").text).toBe("Sin egresos a esta altura de septiembre");
    expect(totalChange(500000, 0, ref, "income").text).toBe("Sin ingresos a esta altura de septiembre");
  });

  it("en inglés", () => {
    const ref = previousMonthReference("September", true, "en");
    expect(balanceChange(1220000, 1125000, ref, "COP", "en").text).toBe("$95,000.00 more than at this point in September");
    expect(totalChange(920000, 1000000, ref, "income", "en").text).toBe("8% less than at this point in September");
    expect(totalChange(500000, 0, ref, "expense", "en").text).toBe("No expenses at this point in September");
  });
});
