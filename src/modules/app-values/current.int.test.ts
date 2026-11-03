import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { appValues } from "@/db/schema";
import { getAppValues } from "./current";
import { DEFAULT_APP_VALUES } from "./values";

// Los valores de la app que valen ahora, con la base de verdad.

const row = { id: 1, upcomingEnabled: false, upcomingDays: 7, budgetNearShare: 60, recurringMinMonths: 2, recurringWindow: 3 };

describe("getAppValues", () => {
  it("sin cambios del admin, los de siempre", async () => {
    expect(await getAppValues()).toEqual(DEFAULT_APP_VALUES);
  });

  it("los que eligió el admin", async () => {
    await db.insert(appValues).values(row);
    expect(await getAppValues()).toEqual({ upcomingEnabled: false, upcomingDays: 7, budgetNearShare: 60, recurringMinMonths: 2, recurringWindow: 3 });
  });

  it.each([
    [{ upcomingDays: 11 }],
    [{ budgetNearShare: 49 }],
    [{ budgetNearShare: 96 }],
    [{ recurringWindow: 7 }],
    [{ recurringMinMonths: 1 }],
    [{ recurringMinMonths: 4, recurringWindow: 3 }],
    [{ id: 2 }],
  ])("la base no acepta %j", async (overrides) => {
    await expect(db.insert(appValues).values({ ...row, ...overrides })).rejects.toThrow();
  });
});
