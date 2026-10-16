import { eq, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { createUser } from "../../../test/integration/factories";
import { reserveAiCall } from "./ai-quota";
import { AI_LIMITS, HOUR_MS } from "./limits";

const NOW = new Date("2026-10-15T15:00:00Z");
let seq = 0;

/** Un mensaje recibido (sin reservar) y su id. */
async function message(phone = "573001112233") {
  const id = `wamid.cupo.${seq++}`;
  await db.insert(whatsappMessage).values({ id, phone, body: "gasté 20 mil" });
  return id;
}

/** Reservas ya hechas por la cuenta en un momento dado. */
async function usedAt(userId: string, at: Date, times: number) {
  for (let i = 0; i < times; i++) {
    await db.insert(whatsappMessage).values({ id: `wamid.usado.${seq++}`, phone: "573001112233", body: "x", userId, aiRequestedAt: at });
  }
}

describe("reserveAiCall", () => {
  it("reserva hasta 20 por hora y marca el mensaje con la cuenta y la hora", async () => {
    const ana = await createUser();
    const results: boolean[] = [];
    for (let i = 0; i < AI_LIMITS.perHour + 2; i++) results.push(await reserveAiCall(ana.id, await message(), NOW));

    expect(results.filter(Boolean)).toHaveLength(20);
    expect(results.slice(20)).toEqual([false, false]);
    const reserved = await db.select().from(whatsappMessage).where(isNotNull(whatsappMessage.aiRequestedAt));
    expect(reserved).toHaveLength(20);
    expect(reserved.every((row) => row.userId === ana.id && row.aiRequestedAt?.getTime() === NOW.getTime())).toBe(true);
  });

  it("el mensaje rechazado no queda marcado", async () => {
    const ana = await createUser();
    await usedAt(ana.id, NOW, AI_LIMITS.perHour);
    const id = await message();
    expect(await reserveAiCall(ana.id, id, NOW)).toBe(false);
    const [row] = await db.select().from(whatsappMessage).where(eq(whatsappMessage.id, id));
    expect(row).toMatchObject({ aiRequestedAt: null, userId: null });
  });

  it("pasada una hora se libera el cupo de la hora, pero no el del día", async () => {
    const ana = await createUser();
    // 20 hace 2 horas: el cupo de la hora vuelve a estar libre.
    await usedAt(ana.id, new Date(NOW.getTime() - 2 * HOUR_MS), 20);
    expect(await reserveAiCall(ana.id, await message(), NOW)).toBe(true);

    // 99 en las últimas 24 horas (repartidos en horas anteriores): queda uno.
    const beto = await createUser();
    for (let h = 2; h <= 6; h++) await usedAt(beto.id, new Date(NOW.getTime() - h * HOUR_MS), h === 6 ? 19 : 20);
    expect(await reserveAiCall(beto.id, await message("573002223344"), NOW)).toBe(true);
    expect(await reserveAiCall(beto.id, await message("573002223344"), NOW)).toBe(false);
  });

  it("lo de hace más de 24 horas no cuenta", async () => {
    const ana = await createUser();
    await usedAt(ana.id, new Date(NOW.getTime() - 25 * HOUR_MS), 150);
    expect(await reserveAiCall(ana.id, await message(), NOW)).toBe(true);
  });

  it("el cupo es de cada cuenta", async () => {
    const ana = await createUser();
    const beto = await createUser();
    await usedAt(ana.id, NOW, AI_LIMITS.perHour);
    expect(await reserveAiCall(ana.id, await message(), NOW)).toBe(false);
    expect(await reserveAiCall(beto.id, await message("573002223344"), NOW)).toBe(true);
  });

  it("una ráfaga de mensajes simultáneos no supera el tope", async () => {
    const ana = await createUser();
    const ids = await Promise.all(Array.from({ length: 30 }, () => message()));
    const results = await Promise.all(ids.map((id) => reserveAiCall(ana.id, id, NOW)));
    expect(results.filter(Boolean)).toHaveLength(AI_LIMITS.perHour);
  });
});
