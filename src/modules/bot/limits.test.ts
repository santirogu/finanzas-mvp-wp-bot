import { describe, expect, it } from "vitest";
import {
  AI_LIMITS,
  AI_LIMIT_BOUNDS,
  DAY_MS,
  HOUR_MS,
  LINK_LIMITS,
  MAX_REPLY_LENGTH,
  MAX_TRANSACTIONS_PER_MESSAGE,
  MONTHLY_TOKEN_BOUNDS,
  TOKEN_BUDGET_TIMEZONE,
  aiQuotaExceeded,
  monthlyBudgetReached,
  parseAiLimits,
  parseMonthlyTokenLimit,
} from "./limits";

describe("límites del bot", () => {
  it("los valores acordados", () => {
    expect(AI_LIMITS).toEqual({ perHour: 20, perDay: 100 });
    expect(LINK_LIMITS).toEqual({ failedAttemptsPerHour: 5, codesPerHour: 5 });
    expect(MAX_TRANSACTIONS_PER_MESSAGE).toBe(20);
    expect(MAX_REPLY_LENGTH).toBe(300);
    expect(HOUR_MS).toBe(3_600_000);
    expect(DAY_MS).toBe(86_400_000);
  });

  it.each([
    [{ lastHour: 0, lastDay: 0 }, false],
    [{ lastHour: 19, lastDay: 99 }, false],
    [{ lastHour: 20, lastDay: 20 }, true],
    [{ lastHour: 0, lastDay: 100 }, true],
    [{ lastHour: 25, lastDay: 150 }, true],
  ])("con %j usados, ¿se acabó el cupo? %s", (used, exceeded) => {
    expect(aiQuotaExceeded(used)).toBe(exceeded);
  });
});

describe("aiQuotaExceeded con los topes del admin", () => {
  it.each([
    [{ lastHour: 1, lastDay: 1 }, false],
    [{ lastHour: 2, lastDay: 2 }, true],
    [{ lastHour: 0, lastDay: 5 }, true],
    [{ lastHour: 0, lastDay: 4 }, false],
  ])("%j con 2 por hora y 5 por día → %s", (used, exceeded) => {
    expect(aiQuotaExceeded(used, { perHour: 2, perDay: 5 })).toBe(exceeded);
  });
});

describe("parseAiLimits", () => {
  it("los rangos que puede poner el admin", () => {
    expect(AI_LIMIT_BOUNDS).toEqual({ perHour: { min: 1, max: 200 }, perDay: { min: 1, max: 2000 } });
  });

  it.each([
    [{ perHour: "30", perDay: "150" }, { perHour: 30, perDay: 150 }],
    [{ perHour: " 1 ", perDay: "1" }, { perHour: 1, perDay: 1 }],
    [{ perHour: "200", perDay: "2.000" }, { perHour: 200, perDay: 2000 }],
    [{ perHour: "20", perDay: "1 000" }, { perHour: 20, perDay: 1000 }],
  ])("%j → %j", (raw, limits) => {
    expect(parseAiLimits(raw)).toEqual({ ok: true, limits });
  });

  it.each([
    [{ perHour: "", perDay: "100" }, "perHour", "Escribe cuántos mensajes por hora, en números."],
    [{ perHour: "20", perDay: "cien" }, "perDay", "Escribe cuántos mensajes por día, en números."],
    [{ perHour: "2,5", perDay: "100" }, "perHour", "Escribe cuántos mensajes por hora, en números."],
    [{ perHour: "-3", perDay: "100" }, "perHour", "Escribe cuántos mensajes por hora, en números."],
    [{ perHour: "0", perDay: "100" }, "perHour", "El tope por hora va de 1 a 200."],
    [{ perHour: "201", perDay: "2000" }, "perHour", "El tope por hora va de 1 a 200."],
    [{ perHour: "20", perDay: "0" }, "perDay", "El tope por día va de 1 a 2.000."],
    [{ perHour: "20", perDay: "2001" }, "perDay", "El tope por día va de 1 a 2.000."],
    [{ perHour: "50", perDay: "40" }, "perHour", "El tope por hora no puede ser mayor que el del día."],
  ])("%j: error en %s", (raw, field, error) => {
    expect(parseAiLimits(raw)).toEqual({ ok: false, field, error });
  });

  it("el de una hora puede ser igual al del día", () => {
    expect(parseAiLimits({ perHour: "40", perDay: "40" })).toEqual({ ok: true, limits: { perHour: 40, perDay: 40 } });
  });
});

describe("el tope mensual de tokens", () => {
  it("los rangos y el mes, en hora de Colombia", () => {
    expect(MONTHLY_TOKEN_BOUNDS).toEqual({ min: 10_000, max: 100_000_000 });
    expect(TOKEN_BUDGET_TIMEZONE).toBe("America/Bogota");
  });

  it.each([
    [null, 5_000_000, false],
    [1000, 999, false],
    [1000, 1000, true],
    [1000, 1001, true],
  ])("tope %s con %d usados → alcanzado: %s", (limit, used, reached) => {
    expect(monthlyBudgetReached(limit, used)).toBe(reached);
  });

  it.each([
    ["", null],
    ["   ", null],
    ["10000", 10_000],
    ["2.000.000", 2_000_000],
    [" 100 000 000 ", 100_000_000],
  ])("%j → %s", (raw, limit) => {
    expect(parseMonthlyTokenLimit(raw)).toEqual({ ok: true, limit });
  });

  it.each([
    ["dos millones", "Escribe cuántos tokens al mes, en números (o déjalo vacío para no tener tope)."],
    ["2,5", "Escribe cuántos tokens al mes, en números (o déjalo vacío para no tener tope)."],
    ["-5", "Escribe cuántos tokens al mes, en números (o déjalo vacío para no tener tope)."],
    ["9999", "El tope mensual va de 10.000 a 100.000.000 tokens."],
    ["100000001", "El tope mensual va de 10.000 a 100.000.000 tokens."],
  ])("%j: %s", (raw, error) => {
    expect(parseMonthlyTokenLimit(raw)).toEqual({ ok: false, error });
  });
});
