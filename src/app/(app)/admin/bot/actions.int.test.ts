import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, botSetting } from "@/db/schema";
import { createAdminWithTwoFactor } from "../../../../../test/integration/two-factor";

// La configuración del bot desde /admin/bot: las Server Actions con la capa de datos y la base de
// verdad, y los códigos como Google Authenticator. Se simulan la sesión y refresh().
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

const { changeAiLimitsAction, pauseClaudeAction, resumeClaudeAction } = await import("./actions");
const { botSettingsForAdmin } = await import("@/modules/admin/bot/bot-settings");
const { getBotSettings } = await import("@/modules/bot/settings");

// Cada código sirve una vez y nunca uno anterior: cada acción usa el de los siguientes 30 s.
let step = 0;
async function seed() {
  const { admin, codeAt } = await createAdminWithTwoFactor();
  mocks.requireAdmin.mockReset().mockResolvedValue({ id: admin.id, role: "admin", twoFactorEnabled: true });
  mocks.refresh.mockReset();
  step = 0;
  return { admin, code: () => codeAt(new Date(Date.now() + 30_000 * step++)) };
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const events = () => db.select({ type: accountEvent.type, userId: accountEvent.userId, adminId: accountEvent.adminId, details: accountEvent.details }).from(accountEvent);

describe("pausar y reanudar Claude", () => {
  it("sin cambios nadie la tocó: Claude activo y los topes de siempre", async () => {
    await seed();
    expect(await botSettingsForAdmin()).toEqual({ claudePaused: false, limits: { perHour: 20, perDay: 100 }, updated: null });
  });

  it("con el código pausa Claude, queda en el historial (sin cuenta) y luego se reanuda", async () => {
    const { admin, code } = await seed();
    const paused = await pauseClaudeAction({}, form({ code: code() }));
    expect(paused).toEqual({ message: "Claude quedó en pausa: el bot responde los comandos y pide registrar lo demás en la web." });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect((await getBotSettings()).claudePaused).toBe(true);
    const view = await botSettingsForAdmin();
    expect(view).toMatchObject({ claudePaused: true, limits: { perHour: 20, perDay: 100 }, updated: { by: "Ana Admin" } });
    expect(view.updated!.at).toBeInstanceOf(Date);

    const resumed = await resumeClaudeAction({}, form({ code: code() }));
    expect(resumed.message).toMatch(/^Claude volvió a funcionar/);
    expect((await getBotSettings()).claudePaused).toBe(false);
    expect(await events()).toEqual([
      { type: "bot_claude_paused", userId: null, adminId: admin.id, details: {} },
      { type: "bot_claude_resumed", userId: null, adminId: admin.id, details: {} },
    ]);
  });

  it("con un código equivocado no cambia nada", async () => {
    await seed();
    expect(await pauseClaudeAction({}, form({ code: "000000" }))).toMatchObject({ field: "code" });
    expect((await getBotSettings()).claudePaused).toBe(false);
    expect(await events()).toEqual([]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("si ya está así, lo dice sin gastar el código", async () => {
    const { code } = await seed();
    const unused = code();
    expect(await resumeClaudeAction({}, form({ code: unused }))).toEqual({ error: "Claude ya está activo." });
    // El mismo código sigue sirviendo para lo que sí cambia.
    expect((await pauseClaudeAction({}, form({ code: unused }))).message).toBeDefined();
    expect(await pauseClaudeAction({}, form({ code: code() }))).toEqual({ error: "Claude ya está en pausa." });
  });

  it("pausar no toca los topes que ya había", async () => {
    const { code } = await seed();
    await db.insert(botSetting).values({ id: 1, aiPerHour: 7, aiPerDay: 70 });
    await pauseClaudeAction({}, form({ code: code() }));
    expect(await getBotSettings()).toEqual({ claudePaused: true, limits: { perHour: 7, perDay: 70 } });
  });
});

describe("cambiar los topes por cuenta", () => {
  it("con el código los cambia y el historial guarda los nuevos y los de antes", async () => {
    const { admin, code } = await seed();
    const result = await changeAiLimitsAction({}, form({ perHour: "30", perDay: "1.500", code: code() }));
    expect(result).toEqual({ message: "Los topes quedaron en 30 por hora y 1.500 por día, por cuenta." });
    expect(await getBotSettings()).toEqual({ claudePaused: false, limits: { perHour: 30, perDay: 1500 } });
    expect(await events()).toEqual([
      {
        type: "bot_limits_changed",
        userId: null,
        adminId: admin.id,
        details: { limits: { perHour: 30, perDay: 1500 }, previousLimits: { perHour: 20, perDay: 100 } },
      },
    ]);
  });

  it("los cambia sin sacar a Claude de la pausa", async () => {
    const { code } = await seed();
    await db.insert(botSetting).values({ id: 1, claudePaused: true, aiPerHour: 20, aiPerDay: 100 });
    await changeAiLimitsAction({}, form({ perHour: "5", perDay: "50", code: code() }));
    expect(await getBotSettings()).toEqual({ claudePaused: true, limits: { perHour: 5, perDay: 50 } });
  });

  it("fuera de rango o iguales, lo dice en su campo sin gastar el código", async () => {
    const { code } = await seed();
    const unused = code();
    expect(await changeAiLimitsAction({}, form({ perHour: "500", perDay: "1000", code: unused }))).toEqual({
      error: "El tope por hora va de 1 a 200.",
      field: "perHour",
    });
    expect(await changeAiLimitsAction({}, form({ perHour: "20", perDay: "100", code: unused }))).toEqual({
      error: "Los topes ya son esos: cambia alguno.",
    });
    expect((await changeAiLimitsAction({}, form({ perHour: "25", perDay: "100", code: unused }))).message).toBeDefined();
    expect(await events()).toHaveLength(1);
  });

  it("con un código equivocado no cambia nada", async () => {
    await seed();
    expect(await changeAiLimitsAction({}, form({ perHour: "30", perDay: "150", code: "123" }))).toMatchObject({ field: "code" });
    expect((await getBotSettings()).limits).toEqual({ perHour: 20, perDay: 100 });
  });
});

describe("sin rol de admin", () => {
  it("ninguna acción ni consulta hace nada", async () => {
    await seed();
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    for (const action of [pauseClaudeAction, resumeClaudeAction, changeAiLimitsAction]) {
      await expect(action({}, form({ perHour: "30", perDay: "150", code: "123456" }))).rejects.toThrow("NEXT_NOT_FOUND");
    }
    await expect(botSettingsForAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await db.select().from(botSetting)).toEqual([]);
    expect(await events()).toEqual([]);
  });
});
