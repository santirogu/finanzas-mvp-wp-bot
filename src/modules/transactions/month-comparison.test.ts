import { describe, expect, it } from "vitest";
import { balanceChange, totalChange } from "./month-comparison";

describe("balanceChange", () => {
  it("dice cuánto más o menos que el mes anterior, en plata", () => {
    expect(balanceChange(850000, 730000, "agosto")).toEqual({ direction: "up", text: "$120.000,00 más que agosto" });
    expect(balanceChange(-50000, 25000.5, "agosto")).toEqual({ direction: "down", text: "$75.000,50 menos que agosto" });
  });

  it("igual si no cambió (sin restos de float)", () => {
    expect(balanceChange(0.3, 0.1 + 0.2, "agosto")).toEqual({ direction: "same", text: "Igual que agosto" });
  });

  it("usa la moneda del usuario", () => {
    expect(balanceChange(100, 0, "agosto", "USD").text).toMatch(/^US\$100,00 más que agosto$/);
  });
});

describe("totalChange", () => {
  it("dice cuánto más o menos que el mes anterior, en porcentaje redondeado", () => {
    expect(totalChange(3350000, 2913043, "agosto", "egresos")).toEqual({
      direction: "up",
      text: "15% más que agosto",
    });
    expect(totalChange(920000, 1000000, "agosto", "ingresos")).toEqual({
      direction: "down",
      text: "8% menos que agosto",
    });
    expect(totalChange(0, 1000, "agosto", "egresos")).toEqual({ direction: "down", text: "100% menos que agosto" });
  });

  it("con miles, el punto de los miles", () => {
    expect(totalChange(250000, 2000, "agosto", "egresos").text).toBe("12.400% más que agosto");
  });

  it("igual si no cambió, y 'casi igual' si cambió menos del medio por ciento", () => {
    expect(totalChange(4200000, 4200000, "agosto", "ingresos")).toEqual({ direction: "same", text: "Igual que agosto" });
    expect(totalChange(0, 0, "agosto", "ingresos")).toEqual({ direction: "same", text: "Igual que agosto" });
    expect(totalChange(1004, 1000, "agosto", "egresos")).toEqual({ direction: "up", text: "Casi igual que agosto" });
    expect(totalChange(996, 1000, "agosto", "egresos")).toEqual({ direction: "down", text: "Casi igual que agosto" });
    expect(totalChange(1005, 1000, "agosto", "egresos").text).toBe("1% más que agosto");
  });

  it("si el mes anterior no tuvo, no hay porcentaje: lo dice", () => {
    expect(totalChange(500000, 0, "agosto", "ingresos")).toEqual({ direction: "up", text: "Sin ingresos en agosto" });
    expect(totalChange(500000, 0, "agosto", "egresos").text).toBe("Sin egresos en agosto");
  });

  it("los centavos que no cambian nada no cuentan como cambio", () => {
    expect(totalChange(0.1 + 0.2, 0.3, "agosto", "egresos").direction).toBe("same");
  });
});
