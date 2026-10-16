import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { whatsappMessage } from "@/db/schema";
import { createUser } from "../../../../test/integration/factories";
import { parseBotFilters } from "./bot-filters";

// Las consultas validan el rol ellas mismas (requireAdmin): aquí la sesión se simula; por defecto,
// la de un admin con la verificación activa.
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdmin: auth.requireAdmin }));
const { botActivity, botSummary } = await import("./bot-activity");

beforeEach(() => {
  auth.requireAdmin.mockReset().mockResolvedValue({ id: "admin", role: "admin", twoFactorEnabled: true });
});

// "Hoy" es el 12 de octubre de 2026 en Colombia. Los mensajes se insertan como los deja el bot
// (src/modules/bot/handle-message.ts): estado, intención (con los tokens de Claude), error y fechas.
const TODAY = "2026-10-12";
const at = (iso: string) => new Date(iso);
const usage = (inputTokens: number, outputTokens: number, model = "claude-haiku-4-5") => ({ model, inputTokens, outputTokens });
const SECRET_TEXT = "gasté 45.900 en el regalo secreto de Ana";

type Message = Partial<typeof whatsappMessage.$inferInsert>;
async function message(values: Message) {
  const receivedAt = values.receivedAt ?? at("2026-10-12T15:00:00Z");
  await db.insert(whatsappMessage).values({
    id: `wamid.${randomUUID()}`,
    phone: "573001112233",
    body: SECRET_TEXT,
    status: "processed",
    receivedAt,
    processedAt: new Date(receivedAt.getTime() + 2000),
    ...values,
  });
}

async function seed() {
  const ana = await createUser({ name: "Ana Bot", email: "ana-bot@correo.com" });
  const beto = await createUser({ name: "Beto Bot", email: "beto-bot@correo.com" });
  const phoneAna = `57300${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  const ana_ = { userId: ana.id, phone: phoneAna };
  // Hoy:
  await message({
    ...ana_,
    intent: { kind: "transactions", items: [{ type: "expense", amount: 45900, description: "Regalo secreto" }], usage: usage(900, 120) },
    reply: "✅ Egreso registrado: Regalo secreto",
    aiRequestedAt: at("2026-10-12T15:00:00Z"),
  });
  await message({ ...ana_, intent: { kind: "command", command: "balance" }, body: "balance", reply: "Balance de octubre: $1.000" });
  await message({ ...ana_, intent: { kind: "reply", text: "¿Cuánto fue?", usage: usage(800, 40) }, aiRequestedAt: at("2026-10-12T15:10:00Z") });
  await message({ ...ana_, intent: { kind: "link", code: "123456" }, body: "VINCULAR 123456" });
  await message({ userId: beto.id, intent: { kind: "error", reason: "rate_limited" } });
  await message({ userId: beto.id, intent: { kind: "error", reason: "rate_limited" } });
  await message({ userId: ana.id, intent: { kind: "error", reason: "rate_limited" } });
  await message({
    ...ana_,
    status: "failed",
    intent: { kind: "error", reason: "api_error: Overloaded", usage: usage(700, 0, "claude-sonnet-4-5") },
    error: "api_error: Overloaded",
    aiRequestedAt: at("2026-10-12T16:00:00Z"),
    processedAt: at("2026-10-12T16:00:20Z"),
    receivedAt: at("2026-10-12T16:00:00Z"),
  });
  await message({ ...ana_, status: "failed", intent: { kind: "command", command: "help" }, error: "envío: 400 (#131030) Recipient not allowed" });
  await message({ status: "link_failed", intent: { kind: "link", code: "000000" }, body: "VINCULAR 000000", phone: "573009998877" });
  await message({ phone: "573009998877", body: "hola" }); // número sin vincular
  await message({ phone: "573009998877", body: "[audio]" }); // no era texto
  await message({ userId: beto.id, body: "gasté 10 mil" }); // cuenta suspendida (sin intención)
  await message({ ...ana_, status: "received", processedAt: null }); // sin procesar
  // Hace 10 días (fuera de "Últimos 7 días"):
  await message({
    ...ana_,
    intent: { kind: "transactions", items: [], usage: usage(1000, 100) },
    receivedAt: at("2026-10-02T15:00:00Z"),
    aiRequestedAt: at("2026-10-02T15:00:00Z"),
  });
  return { ana, beto, phoneAna };
}

const activity = (params: Record<string, string> = {}) => botActivity(parseBotFilters(params), TODAY);

describe("botActivity", () => {
  it("clasifica cada mensaje por su resultado, sin mirar su texto", async () => {
    await seed();
    const today = await activity({ fecha: "hoy", q: "bot@correo.com" });
    // Los de otra cuenta (el número sin vincular) no cuentan con esta búsqueda.
    expect(today.outcomes).toMatchObject({
      registrado: 1,
      comando: 1,
      respuesta: 1,
      vinculado: 1,
      tope_claude: 3,
      error: 2,
      suspendida: 1,
      pendiente: 1,
    });

    const all = await activity({ fecha: "hoy" });
    expect(all.outcomes).toMatchObject({ vinculacion_fallida: 1, sin_vincular: 1, no_texto: 1 });
  });

  it("nunca devuelve el texto, la respuesta ni lo que entendió Claude", async () => {
    await seed();
    const json = JSON.stringify(await activity());
    for (const secret of [SECRET_TEXT, "Regalo secreto", "45900", "Balance de octubre", "¿Cuánto fue?", "123456", "gasté 10 mil", "hola"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("Claude: llamadas, tokens, por día (con ceros) y por modelo", async () => {
    await seed();
    const week = await activity({ fecha: "7d" });
    expect(week.claude).toMatchObject({ calls: 3, inputTokens: 2400, outputTokens: 160 });
    expect(week.claude.byDay).toHaveLength(7);
    expect(week.claude.byDay.at(-1)).toEqual({ day: TODAY, calls: 3 });
    expect(week.claude.byDay[0]).toEqual({ day: "2026-10-06", calls: 0 });
    expect(week.claude.byModel).toEqual([
      { model: "claude-haiku-4-5", calls: 2, inputTokens: 1700, outputTokens: 160 },
      { model: "claude-sonnet-4-5", calls: 1, inputTokens: 700, outputTokens: 0 },
    ]);

    // Con "Todo", los totales son de siempre y el gráfico, de los últimos 30 días.
    const all = await activity();
    expect(all.claude.calls).toBe(4);
    expect(all.claude.byDay).toHaveLength(30);
    expect(all.claude.byDay.find((d) => d.day === "2026-10-02")?.calls).toBe(1);
  });

  it("el tiempo de respuesta (mediana y p95) de los mensajes ya procesados", async () => {
    await seed();
    const { response } = await activity({ fecha: "hoy" });
    expect(response!.median).toBeCloseTo(2, 5);
    expect(response!.p95).toBeGreaterThan(2);
    expect(response!.p95).toBeLessThanOrEqual(20);
    expect((await activity({ fecha: "personalizado", desde: "2026-01-01", hasta: "2026-01-02" })).response).toBeNull();
  });

  it("las cuentas que llegaron al tope de Claude, de la que más a la que menos", async () => {
    const { ana, beto } = await seed();
    const { capped } = await activity({ fecha: "hoy" });
    expect(capped).toEqual([
      { id: beto.id, name: "Beto Bot", email: "beto-bot@correo.com", times: 2 },
      { id: ana.id, name: "Ana Bot", email: "ana-bot@correo.com", times: 1 },
    ]);
  });

  it("los errores agrupados, con su última vez y cuántas cuentas", async () => {
    await seed();
    const { errors } = await activity({ fecha: "hoy" });
    expect(errors.map((e) => [e.error, e.times, e.accounts])).toEqual(
      expect.arrayContaining([
        ["api_error: Overloaded", 1, 1],
        ["envío: 400 (#131030) Recipient not allowed", 1, 1],
      ]),
    );
    expect(errors.find((e) => e.error.startsWith("api_error"))!.last).toEqual(at("2026-10-12T16:00:00Z"));
  });

  it("filtra por fecha y por cuenta o número (con espacios o \"+\")", async () => {
    const { phoneAna } = await seed();
    expect((await activity({ fecha: "hoy" })).total).toBe(14);
    expect((await activity()).total).toBe(15);
    expect((await activity({ q: "Beto" })).total).toBe(3);
    const spaced = `+${phoneAna.slice(0, 2)} ${phoneAna.slice(2, 5)} ${phoneAna.slice(5)}`;
    // Los 8 mensajes que llegaron desde el número de Ana.
    expect((await activity({ q: spaced })).total).toBe(8);
    expect((await activity({ q: "100%_nadie" })).total).toBe(0);
  });

  it("sin rol de admin no consulta nada", async () => {
    auth.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(activity()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(botSummary(TODAY)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("botSummary", () => {
  it("los mensajes y errores de hoy", async () => {
    await seed();
    expect(await botSummary(TODAY)).toEqual({ today: 14, failedToday: 2 });
  });
});
