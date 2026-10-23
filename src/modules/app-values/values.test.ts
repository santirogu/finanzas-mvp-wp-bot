import { describe, expect, it } from "vitest";
import { appValuesFrom, DEFAULT_APP_VALUES, parseAppValues, recurringRuleOf, sameAppValues } from "./values";

// Los valores de la app que cambia el admin: los de siempre, los rangos y cómo se leen del formulario.

const form = (overrides: Partial<Record<string, string>> = {}) => ({
  upcomingEnabled: "on",
  upcomingDays: "3",
  budgetNearShare: "80",
  recurringMinMonths: "3",
  recurringWindow: "4",
  ...overrides,
});

describe("los de siempre", () => {
  it("avisos prendidos con 3 días, cerca desde el 80 % y fijos en 3 de los últimos 4 meses", () => {
    expect(DEFAULT_APP_VALUES).toEqual({ upcomingEnabled: true, upcomingDays: 3, budgetNearShare: 80, recurringMinMonths: 3, recurringWindow: 4 });
    expect(recurringRuleOf(DEFAULT_APP_VALUES)).toEqual({ minMonths: 3, window: 4 });
  });
});

describe("parseAppValues", () => {
  it("lee el formulario (con espacios alrededor); sin el interruptor, apagados", () => {
    expect(parseAppValues(form({ upcomingDays: " 0 " }))).toEqual({ ok: true, values: { ...DEFAULT_APP_VALUES, upcomingDays: 0 } });
    expect(parseAppValues(form({ upcomingEnabled: undefined }))).toMatchObject({ ok: true, values: { upcomingEnabled: false } });
    expect(parseAppValues(form({ budgetNearShare: "95", recurringMinMonths: "6", recurringWindow: "6" }))).toMatchObject({
      ok: true,
      values: { budgetNearShare: 95, recurringMinMonths: 6, recurringWindow: 6 },
    });
  });

  it.each([
    [{ upcomingDays: "11" }, "upcomingDays"],
    [{ upcomingDays: "-1" }, "upcomingDays"],
    [{ upcomingDays: "2.5" }, "upcomingDays"],
    [{ upcomingDays: "" }, "upcomingDays"],
    [{ budgetNearShare: "49" }, "budgetNearShare"],
    [{ budgetNearShare: "96" }, "budgetNearShare"],
    [{ recurringWindow: "2" }, "recurringWindow"],
    [{ recurringWindow: "7" }, "recurringWindow"],
    [{ recurringMinMonths: "1" }, "recurringMinMonths"],
    // No puede pedir más meses de los que se miran.
    [{ recurringMinMonths: "5", recurringWindow: "4" }, "recurringMinMonths"],
  ])("%j no sirve: %s", (overrides, field) => {
    expect(parseAppValues(form(overrides))).toEqual({ ok: false, field });
  });

  it("sin el campo, tampoco", () => {
    expect(parseAppValues({ ...form(), budgetNearShare: null })).toEqual({ ok: false, field: "budgetNearShare" });
  });
});

describe("appValuesFrom y sameAppValues", () => {
  it("lo guardado, tal cual; uno fuera de rango, los de siempre", () => {
    const values = { upcomingEnabled: false, upcomingDays: 7, budgetNearShare: 60, recurringMinMonths: 2, recurringWindow: 3 };
    expect(appValuesFrom(values)).toEqual(values);
    expect(appValuesFrom({ ...values, budgetNearShare: 10 })).toEqual(DEFAULT_APP_VALUES);
  });

  it("compara cada valor", () => {
    expect(sameAppValues(DEFAULT_APP_VALUES, { ...DEFAULT_APP_VALUES })).toBe(true);
    for (const change of [{ upcomingEnabled: false }, { upcomingDays: 4 }, { budgetNearShare: 81 }, { recurringMinMonths: 2 }, { recurringWindow: 5 }]) {
      expect(sameAppValues(DEFAULT_APP_VALUES, { ...DEFAULT_APP_VALUES, ...change }), JSON.stringify(change)).toBe(false);
    }
  });
});
