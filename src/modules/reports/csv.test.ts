import { describe, expect, it } from "vitest";
import { CSV_HEADER, csvAmount, csvFileName, csvText, type CsvMovement, movementsCsv } from "./csv";
import { reportPeriod } from "./period";

const october = { year: 2026, month: 10 };
const movement = (overrides: Partial<CsvMovement> = {}): CsvMovement => ({
  occurredOn: "2026-10-05",
  type: "expense",
  description: "Arriendo",
  categoryName: "Vivienda",
  amount: 1800000,
  source: "web",
  ...overrides,
});

describe("csvText", () => {
  it("un texto común, tal cual (con sus tildes)", () => {
    expect(csvText("Almuerzo con el equipo")).toBe("Almuerzo con el equipo");
    expect(csvText("Educación")).toBe("Educación");
  });

  it.each([
    ["=HIPERVINCULO(\"http://x\")", "\"'=HIPERVINCULO(\"\"http://x\"\")\""],
    ["+57 300", "'+57 300"],
    ["-Ajuste", "'-Ajuste"],
    ["@SUMA(A1)", "'@SUMA(A1)"],
    ["\tTab", "'\tTab"],
    ["\rRetorno", "\"'\rRetorno\""],
  ])("lo que Excel tomaría como fórmula (%j) va como texto, con un apóstrofo", (value, expected) => {
    expect(csvText(value)).toBe(expected);
  });

  it("en el medio, esos signos no molestan", () => {
    expect(csvText("Café = rico")).toBe("Café = rico");
    expect(csvText("Taxi - aeropuerto")).toBe("Taxi - aeropuerto");
  });

  it("con punto y coma, comillas o saltos de línea, entre comillas (y las comillas, dobles)", () => {
    expect(csvText("Mercado; frutas")).toBe('"Mercado; frutas"');
    expect(csvText('Regalo "sorpresa"')).toBe('"Regalo ""sorpresa"""');
    expect(csvText("Dos\nlíneas")).toBe('"Dos\nlíneas"');
    expect(csvText("Dos\rlíneas")).toBe('"Dos\rlíneas"');
  });
});

describe("csvAmount", () => {
  it("con coma decimal, sin puntos de miles; los egresos, negativos", () => {
    expect(csvAmount(1800000, "expense")).toBe("-1800000,00");
    expect(csvAmount(4000000, "income")).toBe("4000000,00");
    expect(csvAmount(45900.5, "expense")).toBe("-45900,50");
    expect(csvAmount(0.07, "income")).toBe("0,07");
    expect(csvAmount(99999999999.99, "income")).toBe("99999999999,99");
  });

  it("redondea a centavos (sin restos de float) y un cero no lleva signo", () => {
    expect(csvAmount(0.1 + 0.2, "income")).toBe("0,30");
    expect(csvAmount(0, "expense")).toBe("0,00");
  });
});

describe("movementsCsv", () => {
  it("con BOM, el encabezado y un movimiento por línea, con saltos de Windows", () => {
    const csv = movementsCsv([
      movement(),
      movement({ occurredOn: "2026-10-15", type: "income", description: "Salario", categoryName: "Salario", amount: 4000000, source: "whatsapp" }),
      movement({ description: "Mercado; varios", categoryName: null, amount: 85000.5 }),
    ]);
    expect(csv).toBe(
      "\uFEFF" +
        [
          "Fecha;Tipo;Descripción;Categoría;Monto;Origen",
          "2026-10-05;Egreso;Arriendo;Vivienda;-1800000,00;Web",
          "2026-10-15;Ingreso;Salario;Salario;4000000,00;WhatsApp",
          '2026-10-05;Egreso;"Mercado; varios";Sin categoría;-85000,50;Web',
        ].join("\r\n") +
        "\r\n",
    );
  });

  it("una categoría que podría ser fórmula también se neutraliza", () => {
    expect(movementsCsv([movement({ categoryName: "=Otros" })])).toContain(";'=Otros;");
  });

  it("sin movimientos, solo el encabezado", () => {
    expect(movementsCsv([])).toBe(`\uFEFF${CSV_HEADER.join(";")}\r\n`);
  });
});

describe("csvFileName", () => {
  it("de un año, con el año; de los últimos 12 meses, con el primer y el último mes", () => {
    expect(csvFileName(reportPeriod("2025", october))).toBe("movimientos-2025.csv");
    expect(csvFileName(reportPeriod(undefined, october))).toBe("movimientos-2025-11-a-2026-10.csv");
  });
});

describe("el CSV en inglés", () => {
  it("separado por comas, con el punto de los centavos, y las comas del texto entre comillas", () => {
    expect(csvText("Rent, October", ",")).toBe('"Rent, October"');
    expect(csvText("Rent; October", ",")).toBe("Rent; October");
    expect(csvAmount(1800000.5, "expense", ".")).toBe("-1800000.50");
    const csv = movementsCsv([movement({ categoryName: null, type: "income", source: "whatsapp" })], "en");
    expect(csv.startsWith("\uFEFFDate,Type,Description,Category,Amount,Source\r\n")).toBe(true);
    expect(csv).toContain(",Income,");
    expect(csv).toContain(",No category,");
    expect(csv).toContain(",WhatsApp\r\n");
    expect(csvFileName(reportPeriod("2025", october), "en")).toBe("transactions-2025.csv");
    expect(csvFileName(reportPeriod(undefined, october), "en")).toBe("transactions-2025-11-to-2026-10.csv");
  });
});
