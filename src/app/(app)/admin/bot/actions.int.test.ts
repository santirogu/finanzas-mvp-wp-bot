import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountEvent, botSetting, whatsappMessage } from "@/db/schema";
import { createAdminWithTwoFactor } from "../../../../../test/integration/two-factor";

// La configuración del bot desde /admin/bot: las Server Actions con la capa de datos y la base de
// verdad, y los códigos como Google Authenticator. Se simulan la sesión y refresh().
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), refresh: vi.fn(), whatsapp: vi.fn(), claude: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
// Las consultas a Meta y a Anthropic se prueban en sus módulos; aquí, lo que hace el admin con ellas.
vi.mock("@/modules/whatsapp/client", async (original) => ({
  ...(await original<typeof import("@/modules/whatsapp/client")>()),
  checkWhatsAppConnection: mocks.whatsapp,
}));
vi.mock("@/modules/bot/claude-extractor", async (original) => ({
  ...(await original<typeof import("@/modules/bot/claude-extractor")>()),
  checkClaudeConnection: mocks.claude,
}));

const { changeAiLimitsAction, changeMonthlyLimitAction, pauseClaudeAction, resendRepliesAction, resumeClaudeAction, testConnectionsAction } =
  await import("./actions");
const { pendingResends, resendFailedReplies } = await import("@/modules/admin/bot/resend");
const { botSettingsForAdmin } = await import("@/modules/admin/bot/bot-settings");
const { getBotSettings } = await import("@/modules/bot/settings");

// Cada código sirve una vez y nunca uno anterior: cada acción usa el de los siguientes 30 s.
let step = 0;
async function seed() {
  const { admin, codeAt } = await createAdminWithTwoFactor();
  mocks.requireAdmin.mockReset().mockResolvedValue({ id: admin.id, role: "admin", twoFactorEnabled: true });
  mocks.refresh.mockReset();
  mocks.whatsapp.mockReset();
  mocks.claude.mockReset();
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
    expect(await botSettingsForAdmin(new Date("2026-10-16T15:00:00Z"))).toEqual({
      claudePaused: false,
      limits: { perHour: 20, perDay: 100 },
      monthlyTokenLimit: null,
      month: { used: 0, reached: false, resetsOn: "2026-11-01" },
      averageTokensPerCall: null,
      updated: null,
    });
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
    expect(await getBotSettings()).toEqual({ claudePaused: true, limits: { perHour: 7, perDay: 70 }, monthlyTokenLimit: null });
  });
});

describe("cambiar los topes por cuenta", () => {
  it("con el código los cambia y el historial guarda los nuevos y los de antes", async () => {
    const { admin, code } = await seed();
    const result = await changeAiLimitsAction({}, form({ perHour: "30", perDay: "1.500", code: code() }));
    expect(result).toEqual({ message: "Los topes quedaron en 30 por hora y 1.500 por día, por cuenta." });
    expect(await getBotSettings()).toEqual({ claudePaused: false, limits: { perHour: 30, perDay: 1500 }, monthlyTokenLimit: null });
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
    expect(await getBotSettings()).toEqual({ claudePaused: true, limits: { perHour: 5, perDay: 50 }, monthlyTokenLimit: null });
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

describe("probar las conexiones", () => {
  it("muestra cada servicio legible y el último mensaje que llegó al webhook, sin cambiar nada", async () => {
    await seed();
    mocks.whatsapp.mockResolvedValue({ status: "ok", detail: "Finanzas MVP · +1 555-662-5913" });
    mocks.claude.mockResolvedValue({ status: "error", error: '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}' });
    await db.insert(whatsappMessage).values([
      { id: "wamid.viejo", phone: "573001112233", body: "x", receivedAt: new Date("2026-10-15T15:00:00Z") },
      { id: "wamid.nuevo", phone: "573001112233", body: "x", receivedAt: new Date("2026-10-16T23:00:00Z") },
    ]);

    const result = await testConnectionsAction();
    expect(result.whatsapp).toEqual({ ok: true, title: "Conectado", detail: "Finanzas MVP · +1 555-662-5913", warning: null });
    expect(result.claude).toMatchObject({ ok: false, title: "La API key de Claude no sirve: vencida, revocada o mal copiada", detail: "HTTP 401 · invalid x-api-key" });
    // 23:00 UTC es 6:00 p. m. en Colombia.
    expect(result.lastMessage).toBe("16 de oct de 2026, 6:00 p. m.");
    expect(result.checkedAt).toMatch(/^\d{1,2}:\d{2}\s[ap]\.\s?m\.$/);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(await events()).toEqual([]);
  });

  it("sin mensajes todavía, lo dice", async () => {
    await seed();
    mocks.whatsapp.mockResolvedValue({ status: "sin_configurar", missing: ["WHATSAPP_ACCESS_TOKEN"] });
    mocks.claude.mockResolvedValue({ status: "ok", detail: "Claude Haiku 5.5 (claude-haiku-5-5)" });
    const result = await testConnectionsAction();
    expect(result.lastMessage).toBeNull();
    expect(result.whatsapp).toMatchObject({ ok: false, title: "Falta configurar WHATSAPP_ACCESS_TOKEN" });
  });

  it("sin rol de admin no prueba nada", async () => {
    await seed();
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(testConnectionsAction()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.claude).not.toHaveBeenCalled();
  });
});

describe("el tope mensual de tokens", () => {
  it("con el código lo pone; la vista dice cuánto va del mes, el promedio y si se alcanzó", async () => {
    const { admin, code } = await seed();
    const now = new Date();
    await db.insert(whatsappMessage).values([
      { id: "wamid.mes.1", phone: "573001112233", body: "x", aiRequestedAt: now, intent: { kind: "reply", usage: { model: "m", inputTokens: 1600, outputTokens: 100 } } },
      { id: "wamid.mes.2", phone: "573001112233", body: "x", aiRequestedAt: now, intent: { kind: "reply", usage: { model: "m", inputTokens: 1800, outputTokens: 100 } } },
    ]);
    expect(await changeMonthlyLimitAction({}, form({ monthlyLimit: "10.000", code: code() }))).toEqual({
      message: "El tope mensual quedó en 10.000 tokens: al llegar, el bot deja de usar Claude hasta el mes siguiente.",
    });
    expect((await getBotSettings()).monthlyTokenLimit).toBe(10_000);
    const view = await botSettingsForAdmin();
    expect(view).toMatchObject({ monthlyTokenLimit: 10_000, month: { used: 3600, reached: false }, averageTokensPerCall: 1800 });
    expect(view.month.resetsOn).toMatch(/^\d{4}-\d{2}-01$/);
    expect(await events()).toEqual([
      { type: "bot_monthly_limit_changed", userId: null, adminId: admin.id, details: { monthlyLimit: 10_000, previousMonthlyLimit: null } },
    ]);

    // Con lo usado por encima del tope, la vista lo marca como alcanzado.
    await db.update(botSetting).set({ monthlyTokenLimit: 3600 });
    expect((await botSettingsForAdmin()).month.reached).toBe(true);
  });

  it("vacío lo quita; fuera de rango o igual, lo dice sin gastar el código", async () => {
    const { code } = await seed();
    await db.insert(botSetting).values({ id: 1, aiPerHour: 20, aiPerDay: 100, monthlyTokenLimit: 500_000 });
    const unused = code();
    expect(await changeMonthlyLimitAction({}, form({ monthlyLimit: "500", code: unused }))).toEqual({
      error: "El tope mensual va de 10.000 a 100.000.000 tokens.",
      field: "monthlyLimit",
    });
    expect(await changeMonthlyLimitAction({}, form({ monthlyLimit: "500.000", code: unused }))).toEqual({
      error: "El tope mensual ya es ese: cambia el número.",
    });
    expect(await changeMonthlyLimitAction({}, form({ monthlyLimit: " ", code: unused }))).toEqual({ message: "Se quitó el tope mensual de tokens." });
    expect((await getBotSettings()).monthlyTokenLimit).toBeNull();
    expect(await changeMonthlyLimitAction({}, form({ monthlyLimit: "", code: code() }))).toEqual({ error: "Ya no hay tope mensual." });
    expect((await events()).map((e) => e.details)).toEqual([{ monthlyLimit: null, previousMonthlyLimit: 500_000 }]);
  });

  it("con un código equivocado no cambia nada", async () => {
    await seed();
    expect(await changeMonthlyLimitAction({}, form({ monthlyLimit: "20000", code: "000000" }))).toMatchObject({ field: "code" });
    expect((await getBotSettings()).monthlyTokenLimit).toBeNull();
  });
});

describe("reenviar las respuestas que no salieron", () => {
  const HOUR = 3_600_000;
  const META = '400 {"error":{"message":"(#131030) Recipient phone number not in allowed list","code":131030}}';

  /** Mensajes como los deja el bot cuando WhatsApp rechaza la respuesta. */
  async function failedReplies(now: Date) {
    const failed = (id: string, values: Partial<typeof whatsappMessage.$inferInsert>) =>
      db.insert(whatsappMessage).values({
        id,
        phone: "573001112233",
        body: "almuerzo 20 mil",
        status: "failed",
        intent: { kind: "transactions" },
        reply: `✅ Respuesta de ${id}`,
        error: `envío: ${META}`,
        receivedAt: new Date(now.getTime() - HOUR),
        ...values,
      });
    await failed("wamid.ana", {});
    await failed("wamid.beto", { phone: "573002223344", intent: { kind: "command", command: "balance" } });
    // No se reenvían: de hace más de 24 horas, un fallo al entender (no al enviar), un aviso de error y
    // una que sí salió.
    await failed("wamid.vieja", { receivedAt: new Date(now.getTime() - 25 * HOUR) });
    await failed("wamid.interno", { error: "TypeError" });
    await failed("wamid.aviso", { intent: { kind: "error", reason: "api_error: 529" }, error: `api_error: 529 · envío: ${META}` });
    await failed("wamid.salio", { status: "processed" });
  }
  const status = async (id: string) => (await db.select({ status: whatsappMessage.status, error: whatsappMessage.error }).from(whatsappMessage).where(eq(whatsappMessage.id, id)))[0];

  it("cuenta solo las que se pueden reenviar", async () => {
    await seed();
    const now = new Date();
    await failedReplies(now);
    expect(await pendingResends(now)).toBe(2);
  });

  it("con el código las reenvía tal cual, las marca como enviadas y lo registra, sin mostrarlas", async () => {
    const { admin, code } = await seed();
    const now = new Date();
    await failedReplies(now);
    const sent: { to: string; body: string }[] = [];
    const result = await resendFailedReplies({ code: code() }, now, async (to, body) => {
      sent.push({ to, body });
      return { ok: true };
    });

    expect(result).toEqual({ ok: true, message: "Se reenviaron 2 respuestas." });
    expect(sent).toEqual(
      expect.arrayContaining([
        { to: "573001112233", body: "✅ Respuesta de wamid.ana" },
        { to: "573002223344", body: "✅ Respuesta de wamid.beto" },
      ]),
    );
    expect(sent).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("Respuesta de");
    expect(await status("wamid.ana")).toMatchObject({ status: "processed" });
    expect(await status("wamid.vieja")).toMatchObject({ status: "failed" });
    expect(await pendingResends(now)).toBe(0);
    expect(await events()).toEqual([{ type: "bot_replies_resent", userId: null, adminId: admin.id, details: { resent: 2, failed: 0 } }]);
  });

  it("si WhatsApp rechaza alguna otra vez, queda para reenviar con el error nuevo", async () => {
    const { code } = await seed();
    const now = new Date();
    await failedReplies(now);
    const result = await resendFailedReplies({ code: code() }, now, async (to) =>
      to === "573002223344" ? { ok: false, error: "401 token vencido" } : { ok: true },
    );
    expect(result).toEqual({ ok: true, message: "Se reenvió 1 respuesta; 1 no salió otra vez." });
    expect(await status("wamid.beto")).toEqual({ status: "failed", error: "envío: 401 token vencido" });
    expect(await pendingResends(now)).toBe(1);
    expect((await events())[0].details).toEqual({ resent: 1, failed: 1 });

    const again = await resendFailedReplies({ code: code() }, now, async () => ({ ok: false, error: "401 token vencido" }));
    expect(again).toEqual({ ok: false, error: "No salió ninguna: WhatsApp rechazó la respuesta otra vez." });
  });

  it("sin nada que reenviar no pide el código; con uno equivocado no envía nada", async () => {
    const { code } = await seed();
    const send = vi.fn(async () => ({ ok: true as const }));
    expect(await resendFailedReplies({ code: code() }, new Date(), send)).toEqual({ ok: false, error: "No hay respuestas para reenviar." });
    await failedReplies(new Date());
    expect(await resendFailedReplies({ code: "000000" }, new Date(), send)).toMatchObject({ ok: false, field: "code" });
    expect(send).not.toHaveBeenCalled();
    expect(await events()).toEqual([]);
  });

  it("la acción lee el código y vuelve a dibujar la página; sin rol no reenvía nada", async () => {
    await seed();
    expect(await resendRepliesAction({}, form({ code: "123" }))).toMatchObject({ error: "No hay respuestas para reenviar." });
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(resendRepliesAction({}, form({ code: "123456" }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(pendingResends()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
