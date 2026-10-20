import { describe, expect, it } from "vitest";
import { LAST_12_MONTHS, periodFileName, periodHref, periodOptions, rangePhrase, reportPeriod } from "./period";

const october = { year: 2026, month: 10 };
const keys = (months: { year: number; month: number }[]) => months.map((m) => `${m.year}-${m.month}`);

describe("reportPeriod", () => {
  it("sin ?periodo=, los últimos 12 meses contando el actual", () => {
    const period = reportPeriod(undefined, october);
    expect(period).toMatchObject({ id: LAST_12_MONTHS, label: "Últimos 12 meses", range: "De noviembre de 2025 a octubre de 2026" });
    expect(keys(period.months)).toEqual([
      "2025-11", "2025-12", "2026-1", "2026-2", "2026-3", "2026-4",
      "2026-5", "2026-6", "2026-7", "2026-8", "2026-9", "2026-10",
    ]);
  });

  it("en diciembre, los 12 meses son los del año", () => {
    const period = reportPeriod("12-meses", { year: 2026, month: 12 });
    expect(period.range).toBe("De enero a diciembre de 2026");
    expect(period.months).toHaveLength(12);
  });

  it("un año pasado, de enero a diciembre", () => {
    const period = reportPeriod("2025", october);
    expect(period).toMatchObject({ id: "2025", label: "2025", range: "De enero a diciembre de 2025" });
    expect(keys(period.months)).toEqual(Array.from({ length: 12 }, (_, i) => `2025-${i + 1}`));
  });

  it("el año en curso, hasta el mes actual (no hay movimientos futuros)", () => {
    const period = reportPeriod("2026", october);
    expect(period.range).toBe("De enero a octubre de 2026");
    expect(keys(period.months)).toEqual(Array.from({ length: 10 }, (_, i) => `2026-${i + 1}`));
  });

  it("en enero, el año en curso es un solo mes", () => {
    const period = reportPeriod("2026", { year: 2026, month: 1 });
    expect(period.range).toBe("Enero de 2026");
    expect(keys(period.months)).toEqual(["2026-1"]);
  });

  it("acepta desde el año 2000 (el primero que acepta la URL)", () => {
    expect(reportPeriod("2000", october).id).toBe("2000");
    expect(reportPeriod("1999", october).id).toBe(LAST_12_MONTHS);
  });

  it.each([["2027"], ["2026-09"], ["abc"], [" 2025"], ["2025 "], ["2025.0"], ["20255"], [""], [["2025"]], [2025]])(
    "con %j (futuro o mal escrito), los últimos 12 meses",
    (param) => {
      expect(reportPeriod(param, october).id).toBe(LAST_12_MONTHS);
    },
  );
});

describe("rangePhrase", () => {
  it("con el año solo al final si es el mismo, y con los dos si cambia", () => {
    expect(rangePhrase([{ year: 2026, month: 3 }, { year: 2026, month: 4 }])).toBe("De marzo a abril de 2026");
    expect(rangePhrase([{ year: 2025, month: 12 }, { year: 2026, month: 1 }])).toBe("De diciembre de 2025 a enero de 2026");
    expect(rangePhrase([{ year: 2026, month: 9 }])).toBe("Septiembre de 2026");
  });
});

describe("periodHref", () => {
  it("los últimos 12 meses van sin ?periodo= (es la dirección de siempre)", () => {
    expect(periodHref(LAST_12_MONTHS)).toBe("/reportes");
    expect(periodHref("12-meses")).toBe("/reportes");
    expect(periodHref("2025")).toBe("/reportes?periodo=2025");
    expect(periodHref(LAST_12_MONTHS, "/reportes/exportar")).toBe("/reportes/exportar");
    expect(periodHref("2025", "/reportes/exportar")).toBe("/reportes/exportar?periodo=2025");
  });
});

describe("periodOptions", () => {
  const active = ["2026-10", "2026-01", "2025-12", "2025-03", "2023-07"];

  it("los últimos 12 meses y cada año con movimientos, del más reciente al más antiguo", () => {
    const options = periodOptions(reportPeriod(undefined, october), active);
    expect(options).toEqual([
      { id: LAST_12_MONTHS, label: "Últimos 12 meses", href: "/reportes", selected: true },
      { id: "2026", label: "2026", href: "/reportes?periodo=2026", selected: false },
      { id: "2025", label: "2025", href: "/reportes?periodo=2025", selected: false },
      { id: "2023", label: "2023", href: "/reportes?periodo=2023", selected: false },
    ]);
  });

  it("marca el año elegido", () => {
    const options = periodOptions(reportPeriod("2025", october), active);
    expect(options.filter((o) => o.selected).map((o) => o.id)).toEqual(["2025"]);
  });

  it("un año elegido sin movimientos también aparece (en su lugar), para que se vea cuál es", () => {
    const options = periodOptions(reportPeriod("2024", october), active);
    expect(options.map((o) => o.id)).toEqual([LAST_12_MONTHS, "2026", "2025", "2024", "2023"]);
    expect(options.find((o) => o.id === "2024")?.selected).toBe(true);
  });

  it("sin movimientos, solo los últimos 12 meses", () => {
    expect(periodOptions(reportPeriod(undefined, october), []).map((o) => o.id)).toEqual([LAST_12_MONTHS]);
  });
});

describe("periodFileName", () => {
  it("un año, con su número; los últimos 12 meses, del primero al último", () => {
    expect(periodFileName("reporte", reportPeriod("2025", october), "pdf")).toBe("reporte-2025.pdf");
    expect(periodFileName("reporte", reportPeriod(undefined, october), "pdf")).toBe("reporte-2025-11-a-2026-10.pdf");
  });
});

describe("el período en inglés", () => {
  const october = { year: 2026, month: 10 };

  it("los últimos 12 meses y un año, con su rango", () => {
    expect(reportPeriod(undefined, october, "en")).toMatchObject({ label: "Last 12 months", range: "November 2025 to October 2026" });
    expect(reportPeriod("2026", october, "en")).toMatchObject({ label: "2026", range: "January to October 2026" });
    expect(rangePhrase([october], "en")).toBe("October 2026");
  });

  it("los chips y el nombre del archivo", () => {
    expect(periodOptions(reportPeriod(undefined, october, "en"), ["2026-10"], "en").map((o) => o.label)).toEqual(["Last 12 months", "2026"]);
    expect(periodFileName("transactions", reportPeriod(undefined, october), "csv", "en")).toBe("transactions-2025-11-to-2026-10.csv");
    expect(periodFileName("transactions", reportPeriod("2025", october), "csv", "en")).toBe("transactions-2025.csv");
  });
});
