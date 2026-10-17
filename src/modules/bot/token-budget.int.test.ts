import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { currentBudgetMonth, tokensUsedThisMonth } from "./token-budget";

// "Ahora" es el 16 de octubre de 2026 en Colombia: el mes va del 1 de octubre a las 00:00 de Colombia
// (05:00 UTC) al 1 de noviembre a la misma hora.
const NOW = new Date("2026-10-16T20:00:00Z");
const usage = (inputTokens: number, outputTokens: number) => ({ model: "claude-haiku-5-5", inputTokens, outputTokens });

async function message(values: Partial<typeof whatsappMessage.$inferInsert>) {
  await db.insert(whatsappMessage).values({ id: `wamid.${randomUUID()}`, phone: "573001112233", body: "x", ...values });
}

describe("tokensUsedThisMonth", () => {
  it("suma la entrada y la salida de los mensajes del mes, de todas las cuentas", async () => {
    await message({ intent: { kind: "transactions", usage: usage(1500, 100) }, aiRequestedAt: new Date("2026-10-10T15:00:00Z") });
    await message({ intent: { kind: "reply", usage: usage(800, 40) }, aiRequestedAt: new Date("2026-10-16T19:00:00Z"), phone: "573009998877" });
    // Sin tokens (un comando, o una llamada que falló antes de responder): no suma.
    await message({ intent: { kind: "command", command: "balance" } });
    await message({ intent: { kind: "error", reason: "api_error: 529" }, aiRequestedAt: new Date("2026-10-16T19:30:00Z") });
    expect(await tokensUsedThisMonth(NOW)).toBe(2440);
  });

  it("el mes empieza y termina a la medianoche de Colombia, no de UTC", async () => {
    // 30 de septiembre a las 11:59 p. m. en Colombia (ya es 1 de octubre en UTC): del mes anterior.
    await message({ intent: { kind: "reply", usage: usage(1000, 0) }, aiRequestedAt: new Date("2026-10-01T04:59:00Z") });
    // 1 de octubre a las 00:00 en Colombia: de este mes.
    await message({ intent: { kind: "reply", usage: usage(200, 0) }, aiRequestedAt: new Date("2026-10-01T05:00:00Z") });
    // 1 de noviembre a las 00:00 en Colombia: del mes siguiente.
    await message({ intent: { kind: "reply", usage: usage(5000, 0) }, aiRequestedAt: new Date("2026-11-01T05:00:00Z") });
    expect(await tokensUsedThisMonth(NOW)).toBe(200);
    expect(currentBudgetMonth(NOW)).toMatchObject({ start: "2026-10-01", end: "2026-11-01" });
  });

  it("los mensajes de antes de la reserva del cupo cuentan por su llegada", async () => {
    await message({ intent: { kind: "transactions", usage: usage(1200, 60) }, receivedAt: new Date("2026-10-05T15:00:00Z") });
    await message({ intent: { kind: "transactions", usage: usage(1200, 60) }, receivedAt: new Date("2026-09-20T15:00:00Z") });
    expect(await tokensUsedThisMonth(NOW)).toBe(1260);
  });

  it("sin mensajes, cero", async () => {
    expect(await tokensUsedThisMonth(NOW)).toBe(0);
  });
});
