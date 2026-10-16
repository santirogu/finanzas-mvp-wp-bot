import { describe, expect, it } from "vitest";
import {
  AI_LIMITS,
  DAY_MS,
  HOUR_MS,
  LINK_LIMITS,
  MAX_REPLY_LENGTH,
  MAX_TRANSACTIONS_PER_MESSAGE,
  aiQuotaExceeded,
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
