import { describe, expect, it } from "vitest";
import { monthRange } from "./dates";
import { inMonthPhrase, monthHref, monthNav, selectedMonth, yearArrows, yearGrid } from "./month-nav";

const october = monthRange(2026, 10);
const september = { year: 2026, month: 9 };

describe("selectedMonth", () => {
  it("da el mes de la URL si ya pasó", () => {
    expect(selectedMonth("2026-09", october)).toEqual(monthRange(2026, 9));
    expect(selectedMonth("2025-12", october)).toEqual(monthRange(2025, 12));
  });

  it.each([
    ["sin ?mes=", undefined],
    ["el mes actual", "2026-10"],
    ["un mes futuro", "2026-11"],
    ["un mes de un año futuro", "2027-01"],
    ["un mes inválido", "2026-13"],
  ])("si no, el actual: %s", (_case, value) => {
    expect(selectedMonth(value, october)).toEqual(october);
  });
});

describe("monthHref", () => {
  it("en el mes actual, la dirección de siempre", () => {
    expect(monthHref("/egresos", october, october)).toBe("/egresos");
    expect(monthHref("/egresos", october, october, { borrado: "abc" })).toBe("/egresos?borrado=abc");
  });

  it("en otro, con ?mes= y después lo demás", () => {
    expect(monthHref("/egresos", september, october)).toBe("/egresos?mes=2026-09");
    expect(monthHref("/ingresos", september, october, { restaurado: "abc" })).toBe(
      "/ingresos?mes=2026-09&restaurado=abc",
    );
  });
});

describe("inMonthPhrase", () => {
  it("dice este mes, el nombre del mes o, si es de otro año, también el año", () => {
    expect(inMonthPhrase(october, october)).toBe("este mes");
    expect(inMonthPhrase(september, october)).toBe("en septiembre");
    expect(inMonthPhrase({ year: 2025, month: 10 }, october)).toBe("en octubre de 2025");
  });

  it("en inglés", () => {
    expect(inMonthPhrase(october, october, "en")).toBe("this month");
    expect(inMonthPhrase(september, october, "en")).toBe("in September");
    expect(inMonthPhrase({ year: 2025, month: 10 }, october, "en")).toBe("in October 2025");
  });
});

describe("monthNav", () => {
  const active = ["2026-10", "2026-08", "2026-07"];

  it("en el mes actual: sin flecha siguiente ni 'Volver al mes actual'", () => {
    expect(monthNav("/dashboard", october, october, active)).toEqual({
      path: "/dashboard",
      label: "Octubre de 2026",
      selected: { year: 2026, month: 10 },
      current: { year: 2026, month: 10 },
      prev: { href: "/dashboard?mes=2026-09", name: "septiembre de 2026" },
      next: null,
      backToCurrent: null,
      activeMonths: active,
      locale: "es",
    });
  });

  it("en inglés, los nombres de los meses", () => {
    const nav = monthNav("/dashboard", september, october, active, "en");
    expect(nav.label).toBe("September 2026");
    expect(nav.prev?.name).toBe("August 2026");
    expect(nav.next?.name).toBe("October 2026");
    expect(nav.locale).toBe("en");
  });

  it("en uno anterior: las dos flechas y 'Volver al mes actual'", () => {
    expect(monthNav("/egresos", september, october, active)).toMatchObject({
      label: "Septiembre de 2026",
      selected: { year: 2026, month: 9 },
      prev: { href: "/egresos?mes=2026-08", name: "agosto de 2026" },
      next: { href: "/egresos", name: "octubre de 2026" },
      backToCurrent: "/egresos",
    });
  });

  it("la flecha anterior va a cualquier mes, aunque no haya movimientos ni antes ni en él", () => {
    expect(monthNav("/dashboard", october, october, []).prev).toEqual({
      href: "/dashboard?mes=2026-09",
      name: "septiembre de 2026",
    });
    expect(monthNav("/egresos", { year: 2020, month: 1 }, october, active).prev).toEqual({
      href: "/egresos?mes=2019-12",
      name: "diciembre de 2019",
    });
  });

  it("solo se apaga en enero de 2000, el primer mes que se puede ver", () => {
    expect(monthNav("/egresos", { year: 2000, month: 1 }, october, active).prev).toBeNull();
    expect(monthNav("/egresos", { year: 2000, month: 2 }, october, active).prev).toMatchObject({ name: "enero de 2000" });
  });

  it("cruza de año en las flechas", () => {
    const january = monthRange(2027, 1);
    const nav = monthNav("/dashboard", { year: 2026, month: 12 }, january, ["2026-01"]);
    expect(nav.prev).toEqual({ href: "/dashboard?mes=2026-11", name: "noviembre de 2026" });
    expect(nav.next).toEqual({ href: "/dashboard", name: "enero de 2027" });
  });
});

describe("yearGrid", () => {
  const nav = monthNav("/egresos", september, october, ["2026-10", "2026-08", "2025-03"]);

  it("los 12 meses del año, con su nombre corto y el completo", () => {
    const grid = yearGrid(nav, 2026);
    expect(grid.map((c) => c.short)).toEqual([
      "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic",
    ]);
    expect(grid[8].name).toBe("septiembre de 2026");
  });

  it("en inglés", () => {
    const grid = yearGrid(monthNav("/egresos", september, october, [], "en"), 2026);
    expect(grid.map((c) => c.short)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
    expect(grid[8].name).toBe("September 2026");
  });

  it("cada mes lleva a su página; el actual sin ?mes= y los futuros a ninguna parte", () => {
    const grid = yearGrid(nav, 2026);
    expect(grid[0].href).toBe("/egresos?mes=2026-01");
    expect(grid[8].href).toBe("/egresos?mes=2026-09");
    expect(grid[9].href).toBe("/egresos");
    expect(grid[10].href).toBeNull();
    expect(grid[11].href).toBeNull();
    expect(yearGrid(nav, 2025).every((c) => c.href?.startsWith("/egresos?mes=2025-"))).toBe(true);
  });

  it("marca el mes que se ve, el actual y los que tienen movimientos", () => {
    const grid = yearGrid(nav, 2026);
    const marked = (key: "selected" | "current" | "active") => grid.filter((c) => c[key]).map((c) => c.short);
    expect(marked("selected")).toEqual(["sept"]);
    expect(marked("current")).toEqual(["oct"]);
    expect(marked("active")).toEqual(["ago", "oct"]);
    // En otro año, el de ese año (y ninguno elegido ni actual).
    const other = yearGrid(nav, 2025);
    expect(other.filter((c) => c.active).map((c) => c.short)).toEqual(["mar"]);
    expect(other.some((c) => c.selected || c.current)).toBe(false);
  });
});

describe("yearArrows", () => {
  const nav = monthNav("/egresos", september, october, []);

  it("van de año en año hasta el actual y hasta el 2000", () => {
    expect(yearArrows(nav, 2026)).toEqual({ prev: 2025, next: null });
    expect(yearArrows(nav, 2025)).toEqual({ prev: 2024, next: 2026 });
    expect(yearArrows(nav, 2001)).toEqual({ prev: 2000, next: 2002 });
    expect(yearArrows(nav, 2000)).toEqual({ prev: null, next: 2001 });
  });
});
