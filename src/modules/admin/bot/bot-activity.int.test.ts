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
const { botAccounts, botActivity, botSummary } = await import("./bot-activity");

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

  it("los mensajes que llegaron con Claude en pausa (o en el tope mensual) cuentan aparte, sin llamada a Claude", async () => {
    await message({ intent: { kind: "error", reason: "paused" } });
    await message({ intent: { kind: "error", reason: "paused" } });
    await message({ intent: { kind: "error", reason: "monthly_limit" } });
    const { outcomes, claude } = await activity({ fecha: "hoy" });
    expect(outcomes).toMatchObject({ pausa: 2, tope_mensual: 1, error: 0, tope_claude: 0 });
    expect(claude.calls).toBe(0);
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

  it("Claude: el costo estimado en dólares, por modelo y con el precio de prompt largo de Haiku 5.5", async () => {
    await seed();
    // Los de hoy: Haiku 4.5 (1.700 y 160) y Sonnet 4.5 (700 y 0).
    const today = await activity({ fecha: "hoy" });
    expect(today.claude.cost.usd).toBeCloseTo((1700 * 1 + 160 * 5 + 700 * 3) / 1_000_000, 12);
    expect(today.claude.cost.unpriced).toEqual([]);

    // Haiku 5.5: una llamada corta (US$0,10 y US$0,50) y una de más de 100.000 tokens (US$0,50 y US$2,50).
    await message({ intent: { kind: "reply", text: "ok", usage: usage(1000, 1000, "claude-haiku-5-5") } });
    await message({ intent: { kind: "reply", text: "ok", usage: usage(150_000, 1000, "claude-haiku-5-5") } });
    // Y uno de un modelo sin precio: no suma, y se nombra.
    await message({ intent: { kind: "reply", text: "ok", usage: usage(9_000_000, 9_000_000, "modelo-raro") } });
    const withNew = await activity({ fecha: "hoy" });
    const haiku55 = (1000 * 0.1 + 1000 * 0.5 + 150_000 * 0.5 + 1000 * 2.5) / 1_000_000;
    expect(withNew.claude.cost.usd).toBeCloseTo((1700 * 1 + 160 * 5 + 700 * 3) / 1_000_000 + haiku55, 12);
    expect(withNew.claude.cost.unpriced).toEqual(["modelo-raro"]);
  });

  it("cuenta también las llamadas de antes de la reserva del cupo (15 de octubre) y las que fallaron sin respuesta", async () => {
    // De antes de #55: con los tokens que usó Claude, pero sin ai_requested_at (se fecha con la llegada).
    await message({ intent: { kind: "transactions", items: [], usage: usage(1500, 90) }, receivedAt: at("2026-10-10T15:00:00Z") });
    // Reservó el cupo, pero la API falló antes de responder: sin tokens.
    await message({
      status: "failed",
      intent: { kind: "error", reason: "api_error: 529" },
      error: "api_error: 529",
      aiRequestedAt: at("2026-10-12T14:00:00Z"),
      receivedAt: at("2026-10-12T14:00:00Z"),
    });
    // Un comando no llama a Claude.
    await message({ intent: { kind: "command", command: "balance" } });

    const week = await activity({ fecha: "7d" });
    expect(week.claude).toMatchObject({ calls: 2, inputTokens: 1500, outputTokens: 90 });
    expect(week.claude.byDay.find((d) => d.day === "2026-10-10")?.calls).toBe(1);
    expect(week.claude.byDay.at(-1)).toEqual({ day: TODAY, calls: 1 });
    expect(week.claude.byModel).toEqual([{ model: "claude-haiku-4-5", calls: 1, inputTokens: 1500, outputTokens: 90 }]);

    // Con fechas, la de antes de la reserva cuenta por su llegada.
    const lastTwoDays = await activity({ fecha: "personalizado", desde: "2026-10-11", hasta: "2026-10-12" });
    expect(lastTwoDays.claude).toMatchObject({ calls: 1, inputTokens: 0, byModel: [] });
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

  it("los errores agrupados, con su última vez y cuántos números", async () => {
    await seed();
    const { errors } = await activity({ fecha: "hoy" });
    expect(errors.map((e) => [e.error, e.times, e.numbers])).toEqual(
      expect.arrayContaining([
        ["api_error: Overloaded", 1, 1],
        ["envío: 400 (#131030) Recipient not allowed", 1, 1],
      ]),
    );
    expect(errors.find((e) => e.error.startsWith("api_error"))!.last).toEqual(at("2026-10-12T16:00:00Z"));
  });

  it("un error de antes de identificar la cuenta (sin cuenta) cuenta por su número", async () => {
    // Si el bot falla antes de saber de quién es el número, el mensaje queda sin cuenta.
    await message({ phone: "573005550001", status: "failed", error: "TypeError" });
    await message({ phone: "573005550001", status: "failed", error: "TypeError" });
    await message({ phone: "573005550002", status: "failed", error: "TypeError" });
    const { errors } = await activity({ fecha: "hoy" });
    expect(errors.find((e) => e.error === "TypeError")).toMatchObject({ times: 3, numbers: 2 });
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

describe("filtrar por resultado (al tocar una barra)", () => {
  it("las barras siguen mostrando todos los resultados; lo demás, solo el elegido", async () => {
    await seed();
    const capped = await activity({ fecha: "hoy", resultado: "tope_claude" });
    expect(capped.total).toBe(3);
    expect(capped.outcomes).toMatchObject({ registrado: 1, tope_claude: 3, error: 2 });
    expect(capped.claude.calls).toBe(0);
    expect(capped.errors).toEqual([]);

    const failed = await activity({ fecha: "hoy", resultado: "error" });
    expect(failed.total).toBe(2);
    expect(failed.claude).toMatchObject({ calls: 1, inputTokens: 700 });
    expect(failed.errors).toHaveLength(2);
  });
});

describe("botAccounts", () => {
  const accounts = (params: Record<string, string> = {}) => botAccounts(parseBotFilters(params), TODAY);

  it("una fila por cuenta, de la que más tokens usa a la que menos; los números sin cuenta, al final", async () => {
    const { ana, beto } = await seed();
    const { rows, hasMore } = await accounts({ fecha: "hoy" });
    expect(hasMore).toBe(false);
    expect(rows.map(({ last, cost, ...row }) => row)).toEqual([
      { id: ana.id, name: "Ana Bot", email: "ana-bot@correo.com", phones: 2, messages: 8, registered: 1, tokens: 2560, errors: 2 },
      { id: beto.id, name: "Beto Bot", email: "beto-bot@correo.com", phones: 1, messages: 3, registered: 0, tokens: 0, errors: 0 },
      { id: null, name: null, email: null, phones: 1, messages: 3, registered: 0, tokens: 0, errors: 0 },
    ]);
    expect(rows[0].last).toEqual(at("2026-10-12T16:00:00Z"));
    // Ana: Haiku 4.5 (1.700 de entrada a US$1 y 160 de salida a US$5, por millón) y Sonnet 4.5 (700 a US$3).
    expect(rows[0].cost).toBeCloseTo((1700 * 1 + 160 * 5 + 700 * 3) / 1_000_000, 12);
    // Sin tokens, cero (no "—").
    expect(rows[1].cost).toBe(0);
    expect(rows[2].cost).toBe(0);
  });

  it("nunca devuelve el texto ni la respuesta de un mensaje", async () => {
    await seed();
    const json = JSON.stringify(await accounts());
    for (const secret of [SECRET_TEXT, "Regalo secreto", "Balance de octubre", "hola"]) expect(json).not.toContain(secret);
  });

  it("se ordena por mensajes, errores o último mensaje, y respeta los filtros", async () => {
    const { ana, beto } = await seed();
    expect((await accounts({ fecha: "hoy", orden: "mensajes" })).rows.map((r) => r.id)).toEqual([ana.id, beto.id, null]);
    expect((await accounts({ fecha: "hoy", orden: "errores" })).rows.map((r) => r.id)).toEqual([ana.id, beto.id, null]);
    // Con todo, el de Ana de hace 10 días suma sus tokens.
    expect((await accounts()).rows[0]).toMatchObject({ id: ana.id, messages: 9, tokens: 3660 });
    // Solo los que llegaron al tope de Claude: Beto tuvo 2, Ana 1.
    const capped = await accounts({ fecha: "hoy", resultado: "tope_claude", orden: "mensajes" });
    expect(capped.rows.map((r) => [r.id, r.messages])).toEqual([
      [beto.id, 2],
      [ana.id, 1],
    ]);
    expect((await accounts({ q: "Beto" })).rows.map((r) => r.id)).toEqual([beto.id]);
  });

  it("el costo de cada cuenta, con los mismos filtros; con un modelo sin precio, null", async () => {
    const { ana, beto } = await seed();
    // Con todo, también el de Ana de hace 10 días (Haiku 4.5, 1.000 y 100).
    const all = (await accounts()).rows.find((r) => r.id === ana.id);
    expect(all?.cost).toBeCloseTo((2700 * 1 + 260 * 5 + 700 * 3) / 1_000_000, 12);
    // Beto usa un modelo que no está en la tabla: no se inventa su costo.
    await message({ userId: beto.id, intent: { kind: "reply", text: "ok", usage: usage(500, 50, "modelo-raro") } });
    const today = await accounts({ fecha: "hoy" });
    expect(today.rows.find((r) => r.id === beto.id)?.cost).toBeNull();
    expect(today.rows.find((r) => r.id === ana.id)?.cost).toBeCloseTo((1700 * 1 + 160 * 5 + 700 * 3) / 1_000_000, 12);
  });

  it("muestra hasta el límite y dice si hay más", async () => {
    const { ana } = await seed();
    const filters = { ...parseBotFilters({ fecha: "hoy" }), limit: 1 };
    const page = await botAccounts(filters, TODAY);
    expect(page.rows.map((r) => r.id)).toEqual([ana.id]);
    expect(page.hasMore).toBe(true);
  });

  it("sin rol de admin no consulta nada", async () => {
    auth.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(accounts()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("botSummary", () => {
  it("los mensajes y errores de hoy", async () => {
    await seed();
    expect(await botSummary(TODAY)).toEqual({ today: 14, failedToday: 2, claudePaused: false, monthlyLimitReached: false });
  });
});
